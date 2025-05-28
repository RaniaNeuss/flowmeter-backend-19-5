import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting seed script...");

    // Seed group: SuperAdmin
    const superAdminGroup = await prisma.group.upsert({
        where: { name: 'SuperAdmin' },
        update: {},
        create: { name: 'SuperAdmin' },
    });
    console.log(`Group '${superAdminGroup.name}' ensured.`);

    // Check if the user already exists
    const existingUser = await prisma.user.findUnique({
        where: { email: 'rania@neuss.com' }
    });

    if (!existingUser) {
        // Seed user: SuperAdmin
        const superAdminUser = await prisma.user.create({
            data: {
                username: 'admin',
                email: 'rania@neuss.com',
                password: await bcrypt.hash('SuperAdmin@2025', 10),
                 groupId :1
            },
        });
        console.log(`SuperAdmin user '${superAdminUser.username}' created.`);
    } else {
        console.log(`SuperAdmin user already exists with email: ${existingUser.email}`);
    }

  const permissions = [


  "devices:canView",
  "devices:canCreate",
  "devices:canUpdate",
  "devices:canDelete",
  "devices:canViewSingleDevice",
  "devices:canTestConnection",
  "devices:canDeleteMultiple",
  "devices:canDeleteAll",

  "users:canView",
  "users:canCreate",
  "users:canUpdate",
  "users:canDelete",
  "users:canRegister",
  "users:canRefreshToken",
  "users:canLogin",
  "users:canLogout",
  "users:canEditProfile",
  "users:canManageRoles",
  "users:canViewGroups",

  "rfps:canCreate",
  "rfps:canViewAll",
  "rfps:canViewSingle",
  "rfps:canUpdate",
  "rfps:canDelete",
  "rfps:canPatch",
  "rfps:canFilter",
];


    // Upsert Permissions
    for (const action of permissions) {
        await prisma.permission.upsert({
            where: { action },
            update: {},
            create: { action },
        });
    }
    console.log("Permissions seeded successfully!");

    // Assign All Permissions to SuperAdmin
    const allPermissions = await prisma.permission.findMany();
    await prisma.group.update({
        where: { id: superAdminGroup.id },
        data: {
            permissions: {
                connect: allPermissions.map((perm) => ({ id: perm.id })),
            },
        },
    });

    console.log(`All permissions assigned to '${superAdminGroup.name}'.`);
}

main()
    .then(() => {
        console.log("Seeding completed.");
        prisma.$disconnect();
    })
    .catch((error) => {
        console.error("Seeding failed:", error);
        prisma.$disconnect();
        
    });
