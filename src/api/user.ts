import { User } from "@/types/team";
import { getHeaders } from "@/utils/headers";

export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const response = await fetch(`/api/user/email`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("Failed to get user");
    }
    return await response.json();
  } catch (error) {
    console.error("Error getting user:", error);
    return null;
  }
};


export const createUser = async (email: string, name: string): Promise<User> => {
  try {
    const response = await fetch(`/api/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, name }),
    });
    if (!response.ok) throw new Error('Failed to create user');
    return await response.json();
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string): Promise<{ message: string }> => {
  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to create user');
    return await response.json();
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};