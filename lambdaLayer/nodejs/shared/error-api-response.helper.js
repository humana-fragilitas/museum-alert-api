import { hasCors } from './has-cors.helper.js';

/**
 * 
 * a more generic api response function could be
 * 
 * apiResponse(environment, statusCode, message, data, ) {
 *   r
 */

export function errorApiResponse(environment,
                                 statusCode,
                                 errorCode,
                                 message,
                                 details = null) {

  const errorBody = {
    error: {
      code: errorCode,
      message: message,
      timestamp: new Date().toISOString()
    }
  };
  
  if (details) {
    errorBody.error.details = details;
  }

  /***
   *       return errorApiResponse(
        stage,
        404,
        'POLICY_NOT_FOUND',
        'IoT policy not found',
        { policyName }
      );
   */
  
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