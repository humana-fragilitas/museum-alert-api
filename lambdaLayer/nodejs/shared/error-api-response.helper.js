import { hasCors } from './has-cors.helper.js';


export function errorApiResponse(environment,
                                 message,
                                 statusCode,
                                 details = null) {

  const errorBody = {
    error: {
      message: message,
      timestamp: new Date().toISOString()
    }
  };
  
  if (details) {
    errorBody.error.details = details;
  }

  return {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      ...(hasCors(environment) && {
        'Access-Control-Allow-Origin': '*'
      }),
    },
    statusCode,
    body: JSON.stringify(errorBody)
  };

};