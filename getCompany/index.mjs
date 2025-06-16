import {
  DynamoDBClient,
  GetItemCommand
} from '@aws-sdk/client-dynamodb';

import { 
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';

// Initialize clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const COMPANIES_TABLE = process.env.COMPANIES_TABLE || 'companies';

/**
 * Get Company Lambda Function
 * 
 * Retrieves the authenticated user's company data
 * Company ID is extracted from user's JWT token (custom:Company claim)
 */
export const handler = async (event, context) => {
  
  validateEnvironmentVariables(['COMPANIES_TABLE']);

  const stage = event.requestContext?.stage;
  
  console.log('Get Company request:', JSON.stringify(event, null, 2));

  // Extract company ID from user session (JWT claims)
  const userClaims = event.requestContext?.authorizer?.claims;
  const companyId = userClaims?.['custom:Company'];
  const userEmail = userClaims?.email;
  
  if (!userClaims) {
    return errorApiResponse(
      stage,
      401,
      'UNAUTHORIZED',
      'Missing or invalid authentication context'
    );
  }
  
  if (!companyId) {
    return errorApiResponse(
      stage,
      404,
      'NO_COMPANY_ASSOCIATED',
      'User has no company associated with their account'
    );
  }

  try {
    // Get the company from DynamoDB
    const company = await getCompanyById(companyId);
    
    if (!company) {
      return errorApiResponse(
        stage,
        404,
        'COMPANY_NOT_FOUND',
        'Company not found'
      );
    }

    // Optional: Verify user belongs to this company
    const userBelongsToCompany = company.members?.some(member => 
      member.email === userEmail || member.username === userEmail
    );

    if (!userBelongsToCompany) {
      console.warn(`User ${userEmail} tried to access company ${companyId} but is not a member`);
      return errorApiResponse(
        stage,
        403,
        'ACCESS_DENIED',
        'User does not belong to this company'
      );
    }

    // Add user-specific context to response
    const userMembership = company.members?.find(member => 
      member.email === userEmail || member.username === userEmail
    );

    const responseData = {
      ...company,
      userRole: userMembership?.role || 'unknown',
      userJoinedAt: userMembership?.joinedAt
    };

    console.log(`✅ Successfully retrieved company: ${companyId} for user: ${userEmail}`);

    return successApiResponse(stage, {
      company: responseData
    });

  } catch (error) {
    console.error('Error retrieving company:', error);
    
    return errorApiResponse(
      stage,
      500,
      'RETRIEVAL_FAILED',
      'Failed to retrieve company data',
      { error: error.message }
    );
  }
};

/**
 * Get company by ID from DynamoDB
 */
const getCompanyById = async (companyId) => {
  try {
    const command = new GetItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      }
    });

    const result = await dynamoClient.send(command);
    
    if (!result.Item) {
      return null;
    }

    // Convert DynamoDB format to regular JSON
    return unmarshallDynamoItem(result.Item);
    
  } catch (error) {
    console.error('Error getting company from DynamoDB:', error);
    throw error;
  }
};

/**
 * Convert DynamoDB item format to regular JSON
 */
const unmarshallDynamoItem = (item) => {
  if (!item) return null;

  const result = {};
  
  Object.keys(item).forEach(key => {
    const value = item[key];
    
    if (value.S !== undefined) {
      result[key] = value.S;
    } else if (value.N !== undefined) {
      result[key] = Number(value.N);
    } else if (value.L !== undefined) {
      // Handle lists (like members array)
      result[key] = value.L.map(item => {
        if (item.M) {
          return unmarshallDynamoItem(item.M);
        }
        return unmarshallDynamoItem(item);
      });
    } else if (value.M !== undefined) {
      // Handle maps (like member objects)
      result[key] = unmarshallDynamoItem(value.M);
    } else if (value.BOOL !== undefined) {
      result[key] = value.BOOL;
    } else if (value.NULL !== undefined) {
      result[key] = null;
    } else if (value.SS !== undefined) {
      // String set
      result[key] = value.SS;
    } else if (value.NS !== undefined) {
      // Number set
      result[key] = value.NS.map(Number);
    }
  });

  return result;
};

// ===== USAGE EXAMPLES =====

/*
API Gateway Integration:

GET /company

Headers:
Authorization: Bearer <JWT_TOKEN>

No path parameters or request body needed.

Success Response Example:
{
  "statusCode": 200,
  "body": {
    "company": {
      "companyId": "123e4567-e89b-12d3-a456-426614174000",
      "companyName": "ACME Corporation",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-06-12T14:22:15.000Z",
      "ownerEmail": "owner@acme.com",
      "ownerUsername": "owner@acme.com",
      "memberCount": 3,
      "members": [
        {
          "email": "owner@acme.com",
          "username": "owner@acme.com",
          "role": "owner",
          "joinedAt": "2024-01-15T10:30:00.000Z"
        },
        {
          "email": "user1@acme.com",
          "username": "user1@acme.com",
          "role": "member",
          "joinedAt": "2024-01-16T09:15:00.000Z"
        }
      ],
      "userRole": "owner",
      "userJoinedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}

Error Response Examples:

1. No company associated:
{
  "statusCode": 404,
  "body": {
    "error": "NO_COMPANY_ASSOCIATED",
    "message": "User has no company associated with their account"
  }
}

2. User not member of company:
{
  "statusCode": 403,
  "body": {
    "error": "ACCESS_DENIED", 
    "message": "User does not belong to this company"
  }
}

3. Company not found:
{
  "statusCode": 404,
  "body": {
    "error": "COMPANY_NOT_FOUND",
    "message": "Company not found"
  }
}

4. Unauthorized:
{
  "statusCode": 401,
  "body": {
    "error": "UNAUTHORIZED",
    "message": "Missing or invalid authentication context"
  }
}

Required Environment Variables:
- COMPANIES_TABLE: DynamoDB table name
- AWS_REGION: AWS region

Required IAM Permissions:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/companies"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream", 
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}

Frontend Usage Example:

// Angular Service
export class CompanyService {
  constructor(private http: HttpClient) {}

  getMyCompany(): Observable<CompanyResponse> {
    return this.http.get<CompanyResponse>('/api/company');
  }
}

// Component Usage
export class CompanyDetailsComponent implements OnInit {
  company: Company | null = null;
  userRole: string = '';
  loading = false;

  constructor(private companyService: CompanyService) {}

  ngOnInit() {
    this.loadCompany();
  }

  loadCompany() {
    this.loading = true;
    this.companyService.getMyCompany()
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (response) => {
          this.company = response.company;
          this.userRole = response.company.userRole;
          console.log('Company loaded:', this.company);
        },
        error: (error) => {
          if (error.status === 404) {
            // Handle no company case - maybe redirect to company creation
            console.log('User has no company');
          } else {
            console.error('Failed to load company:', error);
          }
        }
      });
  }
}

TypeScript Interfaces:
interface Company {
  companyId: string;
  companyName: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
  ownerEmail: string;
  ownerUsername: string;
  memberCount: number;
  members: CompanyMember[];
  userRole?: string;
  userJoinedAt?: string;
}

interface CompanyMember {
  email: string;
  username: string;
  role: 'owner' | 'member' | 'admin';
  joinedAt: string;
}

interface CompanyResponse {
  company: Company;
}
*/