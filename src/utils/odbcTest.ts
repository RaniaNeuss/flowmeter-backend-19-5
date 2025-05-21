import * as odbc from 'odbc';


const connectionString = `
  DSN=MasterPiece;
  TrustServerCertificate=yes;
`;

interface Admin {
  admin_id: number;
  name: string;
  email: string;
  img: string | null;
  password: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
}

async function testODBC(): Promise<void> {
  try {
    console.log('Attempting to connect to DSN: MasterpieceDSN');

    const connection = await odbc.connect(connectionString.trim());
    console.log('✅ Connection Successful!');

    const query = `
      SELECT TOP 10 
        admin_id, 
        name, 
        email, 
        img, 
        password, 
        passwordHash, 
        passwordSalt 
      FROM dbo.Admin`;

    const result = await connection.query<Admin[]>(query);
    console.log('✅ Query Result:', result);

    await connection.close();
    console.log('✅ Connection Closed.');

  } catch (error: any) {
    console.error('❌ Connection Error:', error.message);
    console.error('Error Details:', error);
  }
}

testODBC();
