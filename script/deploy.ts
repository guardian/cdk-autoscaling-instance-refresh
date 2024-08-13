#!/usr/bin/env node

import {
	CloudFormationClient,
	GetTemplateCommand,
} from '@aws-sdk/client-cloudformation';
import { fromIni } from '@aws-sdk/credential-providers';
import { $ } from 'execa';

/*
## DEPLOY
# Upload artifact
# Download current CloudFormation template
# Update CloudFormation stack
# Start instance refresh
# Poll for status = Success for 15 minutes

## ROLLBACK
# Cancel instance refresh
# Apply old CloudFormation template
# Start instance refresh
# Poll for status = Success for 15 minutes
# Exit
 */

const stackName = 'CdkAutoscalingInstanceRefreshStack';

const awsClientConfig = {
	region: 'eu-west-1',
	credentials: fromIni({ profile: 'deployTools' }),
};

async function getCloudformationTemplate() {
	const client = new CloudFormationClient(awsClientConfig);

	const command = new GetTemplateCommand({ StackName: stackName });
	const { TemplateBody } = await client.send(command);

	if (!TemplateBody) {
		throw new Error('Failed to download CloudFormation template');
	}

	return TemplateBody;
}

async function cdkDeploy() {
	const { stdout } = await $`npx cdk deploy`;
	console.log(stdout);
}

async function deploy() {
	const currentTemplate = await getCloudformationTemplate();
	console.log(currentTemplate);
}

deploy()
	.then(() => console.log('Done'))
	.catch((err) => console.error(err));
