import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';

interface CreateLambdaProps {
  scope: Construct;
  id: string;
  functionName: string;
  assetPath: string;
  environment?: { [key: string]: string };
  sharedLayer?: lambda.ILayerVersion;
  config: {
    lambda: {
      timeout: number;
      memorySize: number;
    };
  };
}

export function createLambdaFunction(props: CreateLambdaProps): lambda.Function {

  const logGroup = new logs.LogGroup(props.scope, `${props.functionName}LogGroup`, {
    logGroupName: `/aws/lambda/${props.functionName}`,
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const func = new lambda.Function(props.scope, props.id, {
    functionName: props.functionName,
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromAsset(props.assetPath, {
      exclude: [
        'cdk.out',
        '.git',
        '*.log',
        '.DS_Store',
        'libraries',
        '*.zip',
        'test',
        'tests',
        '__pycache__',
        '.env',
        'node_modules'
      ],
    }),
    layers: props.sharedLayer ? [props.sharedLayer] : undefined,
    environment: props.environment ?? {},
    timeout: cdk.Duration.seconds(props.config.lambda.timeout),
    memorySize: props.config.lambda.memorySize,
    logGroup
  });

  func.role?.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  );

  return func;
  
}


/* USAGE:

// lambda-stack.ts
import { createLambdaFunction } from '../utils/create-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class LambdaStack extends Stack {
  public readonly sharedLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      layerVersionName: 'shared-layer',
      code: lambda.Code.fromAsset('./lambda/lambdaLayer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const config = {
      lambda: {
        timeout: 10,
        memorySize: 512,
      },
    };

    const myLambda = createLambdaFunction({
      scope: this,
      id: 'MyFunction',
      functionName: 'myFunction',
      assetPath: './lambda/myFunctionLambda',
      environment: { HELLO: 'world' },
      useLayer: true,
      sharedLayer: this.sharedLayer,
      config,
    });
  }
}

*/