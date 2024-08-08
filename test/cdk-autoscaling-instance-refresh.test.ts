import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CdkAutoscalingInstanceRefreshStack } from '../lib/cdk-autoscaling-instance-refresh-stack';

describe('CdkAutoscalingInstanceRefreshStack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new CdkAutoscalingInstanceRefreshStack(
			app,
			'CdkAutoscalingInstanceRefreshStack',
			{
				stack: 'playground',
				stage: 'PROD',
				app: 'asg-instance-refresh',
				env: {
					region: 'eu-west-1',
				},
				buildIdentifier: 'ABC',
			},
		);
		expect(Template.fromStack(stack).toJSON()).toMatchSnapshot();
	});
});
