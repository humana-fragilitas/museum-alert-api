import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import { BaseStack,
         BaseStackProps } from './base-stack';


export class DatabaseStack extends BaseStack {

  public readonly tables: { [key: string]: dynamodb.Table } = {};

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);
    this.createCompaniesTable();
    this.applyStandardTags(this);
  }

  private createCompaniesTable(): void {

    this.tables.companies = new dynamodb.Table(this, 'CompaniesTable', {
      tableName: 'companies',
      partitionKey: {
        name: 'companyId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: this.config.dynamodb.billingMode === 'PAY_PER_REQUEST' 
        ? dynamodb.BillingMode.PAY_PER_REQUEST 
        : dynamodb.BillingMode.PROVISIONED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: this.config.dynamodb.pointInTimeRecovery,
      },
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

  }

}