import { hasCors } from './has-cors.helper.js';

export function successApiResponse(environment,
                                   data,
                                   statusCode = 200) {

  return {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      ...(hasCors(environment) && {
        'Access-Control-Allow-Origin': '*'
      }),
    },
    statusCode,
    body: JSON.stringify({
      data: data,
      timestamp: new Date().toISOString()
    })
  };

};