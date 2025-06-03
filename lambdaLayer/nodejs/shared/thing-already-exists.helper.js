
import { IoTClient, DescribeThingCommand } from "@aws-sdk/client-iot";


export async function thingAlreadyExists(reg, thingName, company) {

  try {

    const client = new IoTClient({
      reg
    });
    const input = {
      thingName
    };
    const command = new DescribeThingCommand(input);
    const response = await client.send(command);
    return {
      exists: true,
      sameCompany: response.attributes["Company"] === company
    };

  } catch(error) {

    if (error.name === 'ResourceNotFoundException') {
      return {
        exists: false,
        sameCompany: false
      };
    } else {
      console.error('[LAMBDA LAYER: thingAlreadyExists]: failed to describe thing:',
          error);
      return null;
    }

  }

}