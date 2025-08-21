export function successApiResponse(data,
                                   statusCode = 200) {

  return {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Origin': '*'
    },
    statusCode,
    body: JSON.stringify({
      data: data,
      timestamp: new Date().toISOString()
    })
  };

};