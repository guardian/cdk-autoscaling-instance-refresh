#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import type { BuildIdentifier } from '../lib/cdk-autoscaling-instance-refresh-stack';
import { CdkAutoscalingInstanceRefreshStack } from '../lib/cdk-autoscaling-instance-refresh-stack';

const app = new App();

const buildIdentifierEnvVar = process.env.GU_BUILD_IDENTIFIER as unknown;

if (!buildIdentifierEnvVar) {
	throw new Error('GU_BUILD_IDENTIFIER not set');
}

const buildIdentifier = buildIdentifierEnvVar as BuildIdentifier;

new CdkAutoscalingInstanceRefreshStack(
	app,
	'CdkAutoscalingInstanceRefreshStack',
	{
		stack: 'playground',
		stage: 'PROD',
		app: 'asg-instance-refresh',
		env: {
			region: 'eu-west-1',
		},
		buildIdentifier,
	},
);
