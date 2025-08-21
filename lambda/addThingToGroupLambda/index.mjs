import {
    IoTClient,
    DescribeThingCommand,
    CreateThingGroupCommand,
    DescribeThingGroupCommand,
    AddThingToThingGroupCommand
} from "@aws-sdk/client-iot";

const iotClient = new IoTClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {

    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {

        const thingName = extractThingNameFromEvent(event);

        if (!thingName) {
            throw new Error('Could not extract thing name from event');
        }
        
        console.log(`Processing thing: ${thingName}`);
        
        const thingDetails = await getThingDetails(thingName);
        console.log('Thing details:', JSON.stringify(thingDetails, null, 2));
        
        // Extract company from custom attributes
        const company = extractCompanyFromThing(thingDetails);
        if (!company) {
            console.log(`No company attribute found for thing ${thingName}, skipping grouping`);
            return {
                statusCode: 200,
                message: 'No company attribute found, skipping grouping'
            };
        }
        
        console.log(`Company extracted: ${company}`);
        
        const groupName = `Company-Group-${company}`;
        console.log(`Target group name: ${groupName}`);
        
        await ensureThingGroupExists(groupName, company);
        
        await addThingToGroup(thingName, groupName);
        
        console.log(`Successfully added ${thingName} to group ${groupName}`);
        
        return {
            statusCode: 200,
            message: `Thing ${thingName} successfully added to group ${groupName}`
        };
        
    } catch (error) {
        console.error('Error processing event:', error);
        
        return {
            statusCode: 500,
            message: `Error: ${error.message}`
        };
    }
};

/**
 * Extract thing name from various event sources
 */
function extractThingNameFromEvent(event) {
    console.log('Event structure:', JSON.stringify(event, null, 2));
    
    // IoT Rules Engine event format
    if (event.thingName) {
        return event.thingName;
    }
    
    // IoT Rules Engine alternative format
    if (event.thing && event.thing.thingName) {
        return event.thing.thingName;
    }
    
    // EventBridge event from IoT Core
    if (event.source === 'aws.iot' && event['detail-type'] === 'IoT Thing State Change') {
        return event.detail?.thingName;
    }
    
    // CloudWatch Events (legacy format)
    if (event.detail?.thingName) {
        return event.detail.thingName;
    }
    
    // SNS event
    if (event.Records && event.Records[0]?.Sns?.Message) {
        try {
            const message = JSON.parse(event.Records[0].Sns.Message);
            return message.thingName;
        } catch (e) {
            console.log('Failed to parse SNS message');
        }
    }
    
    // Check if the entire event is just the thing name (simple invocation)
    if (typeof event === 'string') {
        return event;
    }
    
    // Check for nested structures from IoT Rules
    if (event.eventType === 'thing-created' && event.thingName) {
        return event.thingName;
    }
    
    return null;
}

/**
 * Get thing details from IoT Core
 */
async function getThingDetails(thingName) {
    const command = new DescribeThingCommand({
        thingName: thingName
    });
    
    try {
        const response = await iotClient.send(command);
        return response;
    } catch (error) {
        console.error(`Failed to describe thing ${thingName}:`, error);
        throw new Error(`Failed to get details for thing ${thingName}: ${error.message}`);
    }
}

/**
 * Extract company value from thing attributes
 */
function extractCompanyFromThing(thingDetails) {
    // Check in attributes object
    if (thingDetails.attributes && thingDetails.attributes.Company) {
        return thingDetails.attributes.Company;
    }
    
    // Check common variations
    const possibleKeys = ['Company', 'company', 'COMPANY', 'companyId', 'CompanyId'];
    
    for (const key of possibleKeys) {
        if (thingDetails.attributes && thingDetails.attributes[key]) {
            return thingDetails.attributes[key];
        }
    }
    
    return null;
}

/**
 * Ensure thing group exists, create if it doesn't
 */
async function ensureThingGroupExists(groupName, company) {
    try {
        // Try to describe the group first
        const describeCommand = new DescribeThingGroupCommand({
            thingGroupName: groupName
        });
        
        await iotClient.send(describeCommand);
        console.log(`Thing group ${groupName} already exists`);
        
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`Thing group ${groupName} does not exist, creating it`);
            await createThingGroup(groupName, company);
        } else {
            console.error(`Error checking thing group ${groupName}:`, error);
            throw error;
        }
    }
}

/**
 * Create a new thing group
 */
async function createThingGroup(groupName, company) {
    const command = new CreateThingGroupCommand({
        thingGroupName: groupName,
        thingGroupProperties: {
            thingGroupDescription: `Auto-generated group for company: ${company}`,
            attributePayload: {
                attributes: {
                    Company: company,
                    AutoCreated: 'true',
                    CreatedBy: 'iot-auto-grouping-lambda',
                    CreatedAt: new Date().toISOString()
                }
            }
        }
    });
    
    try {
        const response = await iotClient.send(command);
        console.log(`Successfully created thing group: ${groupName}`);
        return response;
    } catch (error) {
        console.error(`Failed to create thing group ${groupName}:`, error);
        throw new Error(`Failed to create thing group ${groupName}: ${error.message}`);
    }
}

/**
 * Add thing to thing group
 */
async function addThingToGroup(thingName, groupName) {
    const command = new AddThingToThingGroupCommand({
        thingGroupName: groupName,
        thingName: thingName
    });
    
    try {
        const response = await iotClient.send(command);
        console.log(`Successfully added ${thingName} to group ${groupName}`);
        return response;
    } catch (error) {
        console.error(`Failed to add ${thingName} to group ${groupName}:`, error);
        throw new Error(`Failed to add thing to group: ${error.message}`);
    }
}