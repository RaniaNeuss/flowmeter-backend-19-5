import { PrismaClient} from '@prisma/client';



const basePrisma = new PrismaClient();




const prisma = basePrisma.$extends({
  query: {
   

   
  
    
    
 
 
  },
});

export default prisma;
