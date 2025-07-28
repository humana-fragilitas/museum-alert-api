#!/bin/bash

# Fixed AWS Infrastructure Inventory Script for IoT Project
# Updated for correct AWS CLI syntax

REGION="eu-west-1"
OUTPUT_DIR="infrastructure-inventory"

echo "🔍 Starting AWS infrastructure inventory for region: $REGION"
echo "📅 Generated on: $(date)"
echo ""

# Create output directory
mkdir -p $OUTPUT_DIR

# Test AWS connectivity
echo "🔐 Testing AWS connectivity..."
aws sts get-caller-identity > $OUTPUT_DIR/account-info.json
if [ $? -eq 0 ]; then
    echo "✅ AWS credentials working"
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    echo "📋 Account ID: $ACCOUNT_ID"
    echo "📍 Current region: $(aws configure get region)"
else
    echo "❌ AWS credentials not configured properly"
    exit 1
fi

echo ""
echo "📊 Exporting resource inventories..."

# IAM Resources
echo "  → IAM roles and policies..."
aws iam list-roles --region $REGION > $OUTPUT_DIR/iam-roles.json 2>/dev/null || echo "No IAM roles found"
aws iam list-policies --scope Local --region $REGION > $OUTPUT_DIR/iam-custom-policies.json 2>/dev/null || echo "No custom policies found"

# DynamoDB Tables
echo "  → DynamoDB tables..."
aws dynamodb list-tables --region $REGION > $OUTPUT_DIR/dynamodb-tables.json 2>/dev/null || echo "No DynamoDB tables found"

# Get table details for each table
TABLES=$(aws dynamodb list-tables --region $REGION --query 'TableNames' --output text 2>/dev/null)
if [ ! -z "$TABLES" ]; then
    echo "    → Getting detailed table information..."
    for table in $TABLES; do
        echo "      • $table"
        aws dynamodb describe-table --table-name "$table" --region $REGION > "$OUTPUT_DIR/dynamodb-table-$table.json" 2>/dev/null
    done
fi

# Cognito User Pools (fixed syntax)
echo "  → Cognito User Pools..."
aws cognito-idp list-user-pools --max-results 20 --region $REGION > $OUTPUT_DIR/cognito-user-pools.json 2>/dev/null || echo "No Cognito User Pools found"

# Get detailed user pool info
USER_POOLS=$(aws cognito-idp list-user-pools --max-results 20 --region $REGION --query 'UserPools[].Id' --output text 2>/dev/null)
if [ ! -z "$USER_POOLS" ]; then
    echo "    → Getting detailed user pool information..."
    for pool in $USER_POOLS; do
        echo "      • $pool"
        aws cognito-idp describe-user-pool --user-pool-id "$pool" --region $REGION > "$OUTPUT_DIR/cognito-pool-$pool.json" 2>/dev/null
        aws cognito-idp list-user-pool-clients --user-pool-id "$pool" --region $REGION > "$OUTPUT_DIR/cognito-clients-$pool.json" 2>/dev/null
    done
fi

# Cognito Identity Pools
echo "  → Cognito Identity Pools..."
aws cognito-identity list-identity-pools --max-results 20 --region $REGION > $OUTPUT_DIR/cognito-identity-pools.json 2>/dev/null || echo "No Cognito Identity Pools found"

# Get detailed identity pool info
IDENTITY_POOLS=$(aws cognito-identity list-identity-pools --max-results 20 --region $REGION --query 'IdentityPools[].IdentityPoolId' --output text 2>/dev/null)
if [ ! -z "$IDENTITY_POOLS" ]; then
    echo "    → Getting detailed identity pool information..."
    for pool in $IDENTITY_POOLS; do
        echo "      • $pool"
        aws cognito-identity describe-identity-pool --identity-pool-id "$pool" --region $REGION > "$OUTPUT_DIR/cognito-identity-pool-$pool.json" 2>/dev/null
    done
fi

# Lambda Functions
echo "  → Lambda functions..."
aws lambda list-functions --region $REGION > $OUTPUT_DIR/lambda-functions.json 2>/dev/null || echo "No Lambda functions found"

# Get detailed lambda info
FUNCTIONS=$(aws lambda list-functions --region $REGION --query 'Functions[].FunctionName' --output text 2>/dev/null)
if [ ! -z "$FUNCTIONS" ]; then
    echo "    → Getting detailed function information..."
    for func in $FUNCTIONS; do
        echo "      • $func"
        aws lambda get-function-configuration --function-name "$func" --region $REGION > "$OUTPUT_DIR/lambda-config-$func.json" 2>/dev/null
    done
fi

# API Gateway
echo "  → API Gateway REST APIs..."
aws apigateway get-rest-apis --region $REGION > $OUTPUT_DIR/apigateway-rest-apis.json 2>/dev/null || echo "No REST APIs found"

# Get detailed API info
APIS=$(aws apigateway get-rest-apis --region $REGION --query 'items[].id' --output text 2>/dev/null)
if [ ! -z "$APIS" ]; then
    echo "    → Getting detailed API information..."
    for api in $APIS; do
        echo "      • $api"
        aws apigateway get-resources --rest-api-id "$api" --region $REGION > "$OUTPUT_DIR/apigateway-resources-$api.json" 2>/dev/null
        aws apigateway get-stages --rest-api-id "$api" --region $REGION > "$OUTPUT_DIR/apigateway-stages-$api.json" 2>/dev/null
    done
fi

# IoT Core
echo "  → IoT Core resources..."
aws iot list-things --region $REGION > $OUTPUT_DIR/iot-things.json 2>/dev/null || echo "No IoT things found"
aws iot list-thing-types --region $REGION > $OUTPUT_DIR/iot-thing-types.json 2>/dev/null || echo "No IoT thing types found"
aws iot list-policies --region $REGION > $OUTPUT_DIR/iot-policies.json 2>/dev/null || echo "No IoT policies found"
aws iot list-topic-rules --region $REGION > $OUTPUT_DIR/iot-topic-rules.json 2>/dev/null || echo "No IoT rules found"

# CloudWatch Log Groups
echo "  → CloudWatch Log Groups..."
aws logs describe-log-groups --region $REGION > $OUTPUT_DIR/cloudwatch-log-groups.json 2>/dev/null || echo "No log groups found"

echo ""
echo "✅ Inventory complete!"
echo "📁 Results saved in: $OUTPUT_DIR/"
echo ""
echo "📝 Summary of what was found:"
echo "================================"

# Generate summary with proper error handling
if [ -f "$OUTPUT_DIR/dynamodb-tables.json" ]; then
    TABLE_COUNT=$(cat $OUTPUT_DIR/dynamodb-tables.json | jq -r '.TableNames | length' 2>/dev/null || echo "0")
    echo "🗄️  DynamoDB Tables: $TABLE_COUNT"
fi

if [ -f "$OUTPUT_DIR/lambda-functions.json" ]; then
    LAMBDA_COUNT=$(cat $OUTPUT_DIR/lambda-functions.json | jq -r '.Functions | length' 2>/dev/null || echo "0")
    echo "⚡ Lambda Functions: $LAMBDA_COUNT"
fi

if [ -f "$OUTPUT_DIR/cognito-user-pools.json" ]; then
    USER_POOL_COUNT=$(cat $OUTPUT_DIR/cognito-user-pools.json | jq -r '.UserPools | length' 2>/dev/null || echo "0")
    echo "👤 Cognito User Pools: $USER_POOL_COUNT"
fi

if [ -f "$OUTPUT_DIR/cognito-identity-pools.json" ]; then
    IDENTITY_POOL_COUNT=$(cat $OUTPUT_DIR/cognito-identity-pools.json | jq -r '.IdentityPools | length' 2>/dev/null || echo "0")
    echo "🆔 Cognito Identity Pools: $IDENTITY_POOL_COUNT"
fi

if [ -f "$OUTPUT_DIR/apigateway-rest-apis.json" ]; then
    API_COUNT=$(cat $OUTPUT_DIR/apigateway-rest-apis.json | jq -r '.items | length' 2>/dev/null || echo "0")
    echo "🌐 API Gateway APIs: $API_COUNT"
fi

if [ -f "$OUTPUT_DIR/iot-things.json" ]; then
    IOT_COUNT=$(cat $OUTPUT_DIR/iot-things.json | jq -r '.things | length' 2>/dev/null || echo "0")
    echo "🔗 IoT Things: $IOT_COUNT"
fi

echo ""
echo "🔍 Next steps:"
echo "1. Review the JSON files in $OUTPUT_DIR/"
echo "2. Look for naming patterns and resource relationships"
echo "3. Use this information to build CDK stacks"