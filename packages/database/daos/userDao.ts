import { prisma } from "../index"; 

export const getUserByEmail = async (email: string) => {
  try {
    return await prisma.user.findUnique({
      where: {
        email: email,
      },
    });
  } catch (error) {
    console.error("Error in getUserByEmail DAO:", error);
    throw error;
  }
};


export const createUser = async (email: string, userId: string, password: string) => {
  try {
    const user = await prisma.user.create({
      data: {
        userId: userId,
        email,
        password, 
        balanceCents: 50000, // Default balance
      },
    });
    return user;
  } catch (error: any) {
    // Handle unique constraint errors (e.g., email already exists)
    if (error.code === 'P2002') {
      throw new Error("User with this email already exists.");
    }
    console.error("Error in createUser DAO:", error);
    throw error;
  }
};