// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';

// const prisma = new PrismaClient();

// async function main() {
//     console.log("Starting seed script...");

//     // Seed group: SuperAdmin
//     const superAdminGroup = await prisma.group.upsert({
//         where: { name: 'SuperAdmin' },
//         update: {},
//         create: { name: 'SuperAdmin' },
//     });
//     console.log(`Group '${superAdminGroup.name}' ensured.`);

//     // Check if the user already exists
//     const existingUser = await prisma.user.findUnique({
//         where: { email: 'rania@neuss.com' }
//     });

//     if (!existingUser) {
//         // Seed user: SuperAdmin
//         const superAdminUser = await prisma.user.create({
//             data: {
//                 username: 'admin',
//                 email: 'rania@neuss.com',
//                 password: await bcrypt.hash('SuperAdmin@2025', 10),
//                  groupId :1
//             },
//         });
//         console.log(`SuperAdmin user '${superAdminUser.username}' created.`);
//     } else {
//         console.log(`SuperAdmin user already exists with email: ${existingUser.email}`);
//     }

//   const permissions = [


//   "devices:canView",
//   "devices:canCreate",
//   "devices:canUpdate",
//   "devices:canDelete",

//   "users:canView",
//   "users:canCreate",
//   "users:canUpdate",
//   "users:canDelete",


//   "rfps:canCreate",
//   "rfps:canView",
//   "rfps:canUpdate",
//   "rfps:canDelete",

// ];


//     // Upsert Permissions
//     for (const action of permissions) {
//         await prisma.permission.upsert({
//             where: { action },
//             update: {},
//             create: { action },
//         });
//     }
//     console.log("Permissions seeded successfully!");

//     // Assign All Permissions to SuperAdmin
//     const allPermissions = await prisma.permission.findMany();
//     await prisma.group.update({
//         where: { id: superAdminGroup.id },
//         data: {
//             permissions: {
//                 connect: allPermissions.map((perm) => ({ id: perm.id })),
//             },
//         },
//     });

//     console.log(`All permissions assigned to '${superAdminGroup.name}'.`);
// }

// main()
//     .then(() => {
//         console.log("Seeding completed.");
//         prisma.$disconnect();
//     })
//     .catch((error) => {
//         console.error("Seeding failed:", error);
//         prisma.$disconnect();
        
//     });

// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';

// const prisma = new PrismaClient();

// async function main() {
//   console.log("Starting seed script...");

//   // Ensure SuperAdmin group
//   const superAdminGroup = await prisma.group.upsert({
//     where: { name: 'SuperAdmin' },
//     update: {},
//     create: { name: 'SuperAdmin' },
//   });
//   console.log(`Group '${superAdminGroup.name}' ensured.`);

//   // Create SuperAdmin user if not exists
//   const existingUser = await prisma.user.findUnique({
//     where: { email: 'rania@neuss.com' },
//   });

//   if (!existingUser) {
//     const superAdminUser = await prisma.user.create({
//       data: {
//         username: 'admin',
//         email: 'rania@neuss.com',
//         password: await bcrypt.hash('SuperAdmin@2025', 10),
//         groupId: superAdminGroup.id,
//       },
//     });
//     console.log(`SuperAdmin user '${superAdminUser.username}' created.`);
//   } else {
//     console.log(`SuperAdmin user already exists with email: ${existingUser.email}`);
//   }

//   console.log("Seeding completed.");
// }

// main()
//   .then(() => prisma.$disconnect())
//   .catch((error) => {
//     console.error("Seeding failed:", error);
//     prisma.$disconnect();
//   });
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Create or ensure SuperAdmin group
  const superAdminGroup = await prisma.group.upsert({
    where: { name: 'SuperAdmin' },
    update: {},
    create: { name: 'SuperAdmin' },
  });
  console.log(`✅ Group '${superAdminGroup.name}' ensured.`);

  // 2. Create or ensure SuperAdmin user
  const existingUser = await prisma.user.findUnique({
    where: { email: 'rania@neuss.com' },
  });

  if (!existingUser) {
    const superAdminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'rania@neuss.com',
        password: await bcrypt.hash('SuperAdmin@2025', 10),
        groupId: superAdminGroup.id,
      },
    });
    console.log(`✅ SuperAdmin user '${superAdminUser.username}' created.`);
  } else {
    console.log(`ℹ️ SuperAdmin user already exists with email: ${existingUser.email}`);
  }

  // 3. Grant full table permissions to SuperAdmin group
  const tables = ['Devices', 'Rfp', 'Users'];

  for (const tableName of tables) {
    await prisma.tablePermission.upsert({
      where: {
        groupId_tableName: {
          groupId: superAdminGroup.id,
          tableName,
        },
      },
      update: {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      },
      create: {
        groupId: superAdminGroup.id,
        tableName,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      },
    });
  }

  console.log("✅ Table permissions granted to SuperAdmin group.");
  console.log("🌱 Seeding completed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    prisma.$disconnect();
  });
