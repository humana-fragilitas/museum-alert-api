import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps} from './base-stack';

export class SharedInfraStack extends BaseStack {

  public readonly sharedLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: BaseStackProps) {

    super(scope, id, props);

    this.sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      layerVersionName: `${this.config.projectName}-shared-layer-${this.config.stage}`,
      code: lambda.Code.fromAsset('./lambda/lambdaLayer', {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash', '-c', [
              'cp -r /asset-input/* /asset-output/',
              'cd /asset-output/nodejs',
              'npm install --only=production',
            ].join(' && ')
          ],
        },
        exclude: [
          'node_modules',
          'cdk.out',
          '.git',
          '*.log',
          '.DS_Store',
          'libraries',
        ],
      }),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: 'Shared utilities for Museum Alert Lambda functions',
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

     new cdk.CfnOutput(this, 'SharedLayerOutput', {
      value: this.sharedLayer.layerVersionArn,
      exportName: 'SharedLayerVersionArn'
    });

  }

}

/**
 * importing the sharedLayer
 * 
 * export class AnalyticsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const layerArn = Fn.importValue('SharedLayerVersionArn');

    const sharedLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'SharedLayerImported', layerArn);

    new lambda.Function(this, 'AnalyticsFunction', {
      code: lambda.Code.fromAsset('lambda'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      layers: [sharedLayer],
    });
  }
}

 */
