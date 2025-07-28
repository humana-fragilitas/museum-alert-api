// lib/stacks/base-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../config/types';

export interface BaseStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export abstract class BaseStack extends cdk.Stack {
  protected readonly config: EnvironmentConfig;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);
    this.config = props.config;
  }

  /**
   * Create a standardized resource name
   */
  protected createResourceName(resourceType: string, resourceName: string): string {
    return `${this.config.projectName}-${resourceType}-${resourceName}-${this.config.stage}`;
  }

  /**
   * Create standardized tags for all resources
   */
  protected getStandardTags(): { [key: string]: string } {
    return {
      Project: this.config.projectName,
      Stage: this.config.stage,
      ManagedBy: 'CDK',
      Region: this.config.region,
    };
  }

  /**
   * Apply standard tags to a construct
   */
  protected applyStandardTags(construct: Construct): void {
    const tags = this.getStandardTags();
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(construct).add(key, value);
    });
  }
}