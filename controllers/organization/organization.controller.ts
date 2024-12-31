import { Request, Response } from "express";
import prisma from "../../connectors/prisma";
import { randomBytes } from "crypto";
import { addDays } from "date-fns";

// Create organization
export const createOrganization = async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;

    // First verify the user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Create organization and add user as OWNER member in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const organization = await prisma.organization.create({
        data: {
          name,
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return organization;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating organization:", error);
    res.status(500).json({ error: "Failed to create organization" });
  }
};

// Get all organizations
export const getOrganizations = async (_: Request, res: Response) => {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
};

// Get organization by ID
export const getOrganizationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        invites: {
          where: {
            status: "PENDING",
          },
          select: {
            email: true,
            token: true,
            status: true,
          },
          distinct: ["email"],
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const transformedOrg = {
      ...organization,
      members: organization.members.map((member) => ({
        ...member,
        status: organization.invites.some(
          (invite) => invite.email === member.user.email
        )
          ? "PENDING"
          : "ACTIVE",
      })),
    };

    res.json(transformedOrg);
  } catch (error) {
    console.error("Error fetching organization:", error);
    res.status(500).json({ error: "Failed to fetch organization" });
  }
};

// Get organizations by user ID
export const getOrganizationsByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const organizations = await prisma.organization.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
};

// Get organizations by user email
export const getOrganizationsByUserEmail = async (
  req: Request,
  res: Response
) => {
  try {
    const { email } = req.params;

    const organizations = await prisma.organization.findMany({
      where: {
        members: {
          some: {
            user: {
              email,
            },
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
};

// Delete organization
export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.organization.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
};

// Delete all organizations by user email
export const deleteOrganizationsByUserEmail = async (
  req: Request,
  res: Response
) => {
  try {
    const { email } = req.params;

    // First get all organizations where user is OWNER
    const organizationsToDelete = await prisma.organization.findMany({
      where: {
        members: {
          some: {
            user: {
              email,
            },
            role: "OWNER",
          },
        },
      },
      select: {
        id: true,
      },
    });

    // Delete all found organizations in a transaction
    await prisma.$transaction(
      organizationsToDelete.map((org) =>
        prisma.organization.delete({
          where: { id: org.id },
        })
      )
    );

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting organizations:", error);
    res.status(500).json({ error: "Failed to delete organizations" });
  }
};

// Update organization
export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedOrganization = await prisma.organization.update({
      where: { id },
      data: {
        name,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.json(updatedOrganization);
  } catch (error) {
    console.error("Error updating organization:", error);
    res.status(500).json({ error: "Failed to update organization" });
  }
};

// Delete member from organization
export const deleteMember = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;

    // Check if member exists and is not the last OWNER
    const memberCount = await prisma.member.count({
      where: {
        orgId,
        role: "OWNER",
      },
    });

    const memberToDelete = await prisma.member.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    });

    if (!memberToDelete) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    if (memberToDelete.role === "OWNER" && memberCount <= 1) {
      res
        .status(400)
        .json({ error: "Cannot delete the last owner of the organization" });
      return;
    }

    await prisma.member.delete({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting member:", error);
    res.status(500).json({ error: "Failed to delete member" });
  }
};

// Add member to organization with invite
// Controller update
export const addMember = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { email, role, inviterId } = req.body;

    const result = await prisma.$transaction(async (prisma) => {
      // Check for existing pending invite
      const existingInvite = await prisma.invite.findFirst({
        where: {
          email,
          orgId,
          inviterId,
          status: "PENDING",
        },
      });

      // Check/create user
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name: email.split("@")[0],
            password: "",
          },
        });
      }

      // Create or update member
      const member = await prisma.member.upsert({
        where: {
          userId_orgId: {
            userId: user.id,
            orgId,
          },
        },
        update: { role },
        create: {
          userId: user.id,
          orgId,
          role,
        },
      });

      // Reuse existing token or create new invite
      const invite = existingInvite || await prisma.invite.create({
        data: {
          email,
          orgId,
          inviterId,
          role,
          token: randomBytes(32).toString("hex"),
          expiresAt: addDays(new Date(), 7),
          status: "PENDING",
        },
        include: {
          organization: true,
          inviter: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      return { member, invite };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating member and invite:", error);
    res.status(500).json({ error: "Failed to create member and invite" });
  }
};


// Join organization through invite link
export const joinOrganization = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { email } = req.body;

    // Get user first
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        organization: true
      }
    });

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    if (invite.status !== "PENDING") {
      res.status(400).json({ error: "Invite is no longer valid" });
      return;
    }

    if (invite.email !== email) {
      res.status(400).json({ error: "Email does not match invite" });
      return;
    }

    if (invite.expiresAt < new Date()) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" }
      });
      res.status(400).json({ error: "Invite has expired" });
      return;
    }

    const result = await prisma.$transaction(async (prisma) => {
      const member = await prisma.member.upsert({
        where: {
          userId_orgId: {
            userId: user.id,
            orgId: invite.orgId
          }
        },
        update: {
          role: invite.role
        },
        create: {
          userId: user.id,
          orgId: invite.orgId,
          role: invite.role
        }
      });

      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED" }
      });

      return member;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error joining organization:", error);
    res.status(500).json({ error: "Failed to join organization" });
  }
};


// Get token by member ID
export const getInviteTokenByMemberId = async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
 
    const invite = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        user: {
          select: { email: true }
        },
        organization: {
          select: {
            invites: {
              where: { status: 'PENDING' },
              select: { token: true }
            }
          }
        }
      }
    });
 
    if (!invite || !invite.user || invite.organization.invites.length === 0) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
 
    res.json({ token: invite.organization.invites[0].token });
  } catch (error) {
    console.error('Error fetching invite token:', error);
    res.status(500).json({ error: 'Failed to fetch invite token' });
  }
 };