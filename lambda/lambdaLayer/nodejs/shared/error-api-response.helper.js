export function errorApiResponse(message,
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
      'Access-Control-Allow-Origin': '*'
    },
    statusCode,
    body: JSON.stringify(errorBody)
  };

}