import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps} from './base-stack';

export class SharedInfraStack extends BaseStack {

  public readonly sharedLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: BaseStackProps) {

    super(scope, id, props);

    this.sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset('layer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
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
