#!/bin/bash

# Resource Analysis Script - Find patterns and dependencies
OUTPUT_DIR="infrastructure-inventory"

echo "🔍 Analyzing AWS Resource Patterns and Dependencies"
echo "=================================================="

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "❌ No inventory found. Run ./scripts/inventory.sh first"
    exit 1
fi

echo ""
echo "📋 Resource Naming Patterns Analysis:"
echo "======================================"

# Analyze DynamoDB table names
if [ -f "$OUTPUT_DIR/dynamodb-tables.json" ]; then
    echo "🗄️  DynamoDB Tables:"
    cat $OUTPUT_DIR/dynamodb-tables.json | jq -r '.TableNames[]?' 2>/dev/null | while read table; do
        echo "    • $table"
    done
    echo ""
fi

# Analyze Lambda function names
if [ -f "$OUTPUT_DIR/lambda-functions.json" ]; then
    echo "⚡ Lambda Functions:"
    cat $OUTPUT_DIR/lambda-functions.json | jq -r '.Functions[]?.FunctionName' 2>/dev/null | while read func; do
        echo "    • $func"
    done
    echo ""
fi

# Analyze Cognito pools
if [ -f "$OUTPUT_DIR/cognito-user-pools.json" ]; then
    echo "👤 Cognito User Pools:"
    cat $OUTPUT_DIR/cognito-user-pools.json | jq -r '.UserPools[]? | "    • \(.Name) (ID: \(.Id))"' 2>/dev/null
    echo ""
fi

# Analyze API Gateway
if [ -f "$OUTPUT_DIR/apigateway-rest-apis.json" ]; then
    echo "🌐 API Gateway APIs:"
    cat $OUTPUT_DIR/apigateway-rest-apis.json | jq -r '.items[]? | "    • \(.name) (ID: \(.id))"' 2>/dev/null
    echo ""
fi

# Analyze IoT resources
if [ -f "$OUTPUT_DIR/iot-things.json" ]; then
    echo "🔗 IoT Things:"
    cat $OUTPUT_DIR/iot-things.json | jq -r '.things[]? | "    • \(.thingName) (Type: \(.thingTypeName // "None"))"' 2>/dev/null
    echo ""
fi

echo "🔗 Potential Dependencies Analysis:"
echo "==================================="

# Look for Lambda environment variables that reference other resources
if [ -f "$OUTPUT_DIR/lambda-functions.json" ]; then
    FUNCTIONS=$(cat $OUTPUT_DIR/lambda-functions.json | jq -r '.Functions[]?.FunctionName' 2>/dev/null)
    for func in $FUNCTIONS; do
        if [ -f "$OUTPUT_DIR/lambda-config-$func.json" ]; then
            echo "⚡ Function: $func"
            echo "    Environment Variables:"
            cat "$OUTPUT_DIR/lambda-config-$func.json" | jq -r '.Environment.Variables // {} | to_entries[] | "      \(.key) = \(.value)"' 2>/dev/null | head -10
            echo "    IAM Role:"
            cat "$OUTPUT_DIR/lambda-config-$func.json" | jq -r '.Role' 2>/dev/null | sed 's/^/      /'
            echo ""
        fi
    done
fi

echo "📊 Suggested CDK Stack Organization:"
echo "===================================="
echo "Based on your resources, consider these stacks:"
echo ""
echo "1. 🔐 IAM Stack (iam-stack.ts)"
echo "   → All IAM roles and policies"
echo ""
echo "2. 🗄️  Database Stack (database-stack.ts)"
echo "   → DynamoDB tables and indexes"
echo ""
echo "3. 👤 Cognito Stack (cognito-stack.ts)"
echo "   → User pools and identity providers"
echo ""
echo "4. ⚡ Lambda Stack (lambda-stack.ts)"
echo "   → All Lambda functions and layers"
echo ""
echo "5. 🔗 IoT Stack (iot-stack.ts)"
echo "   → IoT Core things, policies, and rules"
echo ""
echo "6. 🌐 API Gateway Stack (api-gateway-stack.ts)"
echo "   → REST APIs, resources, and deployments"
echo ""

echo "💡 Common Naming Patterns Found:"
echo "================================"

# Extract common prefixes/suffixes
ALL_NAMES=""
[ -f "$OUTPUT_DIR/dynamodb-tables.json" ] && ALL_NAMES="$ALL_NAMES $(cat $OUTPUT_DIR/dynamodb-tables.json | jq -r '.TableNames[]?' 2>/dev/null)"
[ -f "$OUTPUT_DIR/lambda-functions.json" ] && ALL_NAMES="$ALL_NAMES $(cat $OUTPUT_DIR/lambda-functions.json | jq -r '.Functions[]?.FunctionName' 2>/dev/null)"

if [ ! -z "$ALL_NAMES" ]; then
    echo "Resource names suggest these patterns:"
    echo "$ALL_NAMES" | tr ' ' '\n' | grep -E '^[a-zA-Z-]+' | head -5 | while read name; do
        echo "    • $name"
    done
fi

echo ""
echo "✅ Analysis complete!"
echo "Review the patterns above to customize your CDK configuration."

