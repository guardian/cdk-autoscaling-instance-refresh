import { MetadataKeys } from '@guardian/cdk/lib/constants';
import { GuCertificate } from '@guardian/cdk/lib/constructs/acm';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import {
	GuDistributionBucketParameter,
	GuLoggingStreamNameParameter,
	GuStack,
} from '@guardian/cdk/lib/constructs/core';
import { GuDnsRecordSet, RecordType } from '@guardian/cdk/lib/constructs/dns';
import {
	GuHttpsEgressSecurityGroup,
	GuVpc,
	SubnetType,
} from '@guardian/cdk/lib/constructs/ec2';
import { GuInstanceRole } from '@guardian/cdk/lib/constructs/iam';
import type { App } from 'aws-cdk-lib';
import { CfnOutput, Duration, Tags } from 'aws-cdk-lib';
import {
	AutoScalingGroup,
	GroupMetrics,
	HealthCheck,
} from 'aws-cdk-lib/aws-autoscaling';
import type { MachineImageConfig } from 'aws-cdk-lib/aws-ec2';
import {
	InstanceClass,
	InstanceSize,
	InstanceType,
	LaunchTemplate,
	OperatingSystemType,
	UserData,
} from 'aws-cdk-lib/aws-ec2';
import {
	ApplicationListener,
	ApplicationLoadBalancer,
	ApplicationProtocol,
	ApplicationTargetGroup,
	ListenerAction,
	Protocol,
	SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export type BuildIdentifier =
	| 'ABC' // This version has a working healthcheck
	| 'XYZ' // This version has a working healthcheck
	| '500'; // This version has a failing healthcheck

interface CdkAutoscalingInstanceRefreshStackProps extends GuStackProps {
	app: string;
	buildIdentifier: BuildIdentifier;
}

export class CdkAutoscalingInstanceRefreshStack extends GuStack {
	constructor(
		scope: App,
		id: string,
		props: CdkAutoscalingInstanceRefreshStackProps,
	) {
		super(scope, id, props);

		const { stack, stage, app, buildIdentifier } = props;

		const filename = `${app}-${buildIdentifier}.deb`;
		const domainName = `${app}.gutools.co.uk`;

		const vpcPublicSubnets = GuVpc.subnetsFromParameter(this, {
			type: SubnetType.PUBLIC,
		});

		const vpcPrivateSubnets = GuVpc.subnetsFromParameter(this, {
			type: SubnetType.PRIVATE,
		});

		const vpc = GuVpc.fromIdParameter(this, 'vpc', {
			/*
			CDK wants privateSubnetIds to be a multiple of availabilityZones.
			We're pulling the subnets from a parameter at runtime.
			We know they evaluate to 3 subnets, but at compile time CDK doesn't.
			Set the number of AZs to 1 to avoid the error:
			  `Error: Number of privateSubnetIds (1) must be a multiple of availability zones (2).`
			 */
			availabilityZones: ['ignored'],
			publicSubnetIds: vpcPublicSubnets.map(({ subnetId }) => subnetId),
			privateSubnetIds: vpcPrivateSubnets.map(({ subnetId }) => subnetId),
		});

		const artifactBucketName =
			GuDistributionBucketParameter.getInstance(this).valueAsString;
		const bucket = Bucket.fromBucketName(
			this,
			'DistributionBucket',
			artifactBucketName,
		);
		const bucketKey = [stack, stage, app, filename].join('/');

		const userData = UserData.forLinux();
		userData.addS3DownloadCommand({
			bucket,
			bucketKey,
			localFile: `/${app}/${filename}`,
		});
		userData.addCommands(`dpkg -i /${app}/${filename}`);

		const instanceRole = new GuInstanceRole(this, { app });

		const launchTemplate = new LaunchTemplate(this, 'LaunchTemplate', {
			detailedMonitoring: true,
			instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
			userData,
			requireImdsv2: true,
			role: instanceRole,
			securityGroup: GuHttpsEgressSecurityGroup.forVpc(this, { app, vpc }),
			instanceMetadataTags: true,
			machineImage: {
				getImage: (): MachineImageConfig => {
					return {
						osType: OperatingSystemType.LINUX,
						userData,
						imageId: 'ami-0ba2d40d73e6cf972',
					};
				},
			},
		});

		new CfnOutput(this, `LaunchTemplateId-${app}`, {
			key: `LaunchTemplateId-${app}`.replaceAll('-', ''),
			value: launchTemplate.launchTemplateId!,
		});

		new CfnOutput(this, `LaunchTemplateLatestVersion-${app}`, {
			key: `LaunchTemplateLatestVersion-${app}`.replaceAll('-', ''),
			value: launchTemplate.latestVersionNumber,
		});

		const autoscalingGroup = new AutoScalingGroup(this, 'AutoScalingGroup', {
			vpc,
			vpcSubnets: {
				subnets: vpc.privateSubnets,
			},
			minCapacity: 3,
			maxCapacity: 10,
			launchTemplate,
			groupMetrics: [GroupMetrics.all()],
			healthCheck: HealthCheck.elb({
				// How long before the ASG checks that the ALB thinks the instance is healthy
				grace: Duration.minutes(2),
			}),
			defaultInstanceWarmup: Duration.seconds(0),
		});

		// Tags for application log shipping
		Tags.of(autoscalingGroup).add(
			MetadataKeys.LOG_KINESIS_STREAM_NAME,
			GuLoggingStreamNameParameter.getInstance(this).valueAsString,
		);
		Tags.of(autoscalingGroup).add(MetadataKeys.SYSTEMD_UNIT, `${app}.service`);

		new CfnOutput(this, 'AutoScalingGroupName', {
			key: 'AutoScalingGroup',
			value: autoscalingGroup.autoScalingGroupName,
		});

		const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
			protocol: ApplicationProtocol.HTTP,
			deregistrationDelay: Duration.seconds(30),
			vpc,
			healthCheck: {
				path: '/healthcheck',
				protocol: Protocol.HTTP,
				healthyThresholdCount: 5,
				unhealthyThresholdCount: 2,
				interval: Duration.seconds(10),
				timeout: Duration.seconds(2),
			},
			port: 9000,
			targets: [autoscalingGroup],
		});

		const loadBalancer = new ApplicationLoadBalancer(this, 'ALB', {
			vpc,
			vpcSubnets: {
				subnets: vpc.publicSubnets,
			},
			internetFacing: true,
		});
		const certificate = new GuCertificate(this, {
			app,
			domainName,
		});

		new ApplicationListener(this, 'Listener', {
			loadBalancer,
			defaultAction: ListenerAction.forward([targetGroup]),
			port: 443,
			protocol: ApplicationProtocol.HTTPS,
			sslPolicy: SslPolicy.RECOMMENDED_TLS,
			certificates: [certificate],
		});

		new GuDnsRecordSet(this, 'DNS', {
			name: domainName,
			ttl: Duration.minutes(1),
			recordType: RecordType.CNAME,
			resourceRecords: [loadBalancer.loadBalancerDnsName],
		});

		autoscalingGroup.scaleOnRequestCount('ScaleOutOnRequests', {
			targetRequestsPerMinute: 5,
		});
	}
}
