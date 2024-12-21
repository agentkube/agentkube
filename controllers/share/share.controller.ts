// controllers/investigation-share.controller.ts
import { Request, Response } from "express";
import prisma from "../../connectors/prisma";
import { randomBytes } from "crypto";

// Create a shareable link
export const createShareableLink = async (req: Request, res: Response) => {
  try {
    const { investigationId, userId, expiresIn } = req.body;

    // Validate request
    if (!investigationId || !userId) {
      res.status(400).json({
        error:
          "Missing required fields: investigationId and userId are required",
      });
      return;
    }

    // Verify user has access to the investigation
    const investigation = await prisma.investigation.findFirst({
      where: {
        id: investigationId,
        cluster: {
          apiKey: {
            user: {
              members: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        },
      },
    });

    if (!investigation) {
      res.status(404).json({
        error: "Investigation not found or you do not have access to share it",
      });
      return;
    }

    // Check for existing active share link
    const existingShareLink = await prisma.sharedInvestigation.findFirst({
      where: {
        investigationId,
        isActive: true,
        // Only consider non-expired links
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        investigation: {
          select: {
            name: true,
            description: true,
            type: true,
            status: true,
          },
        },
      },
    });

    if (existingShareLink) {
      // Return existing share link
      res.status(200).json({
        message: "Using existing shareable link",
        shareUrl: `${process.env.APP_URL}/share/investigation/${existingShareLink.shareToken}`,
        sharedInvestigation: existingShareLink,
        isExisting: true,
      });
      return;
    }

    // If no existing active link, create a new one
    const shareToken = randomBytes(32).toString("hex");
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    const sharedInvestigation = await prisma.sharedInvestigation.create({
      data: {
        shareToken,
        investigation: { connect: { id: investigationId } },
        createdBy: { connect: { id: userId } },
        expiresAt,
        isActive: true,
      },
      include: {
        investigation: {
          select: {
            name: true,
            description: true,
            type: true,
            status: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "New shareable link created successfully",
      shareUrl: `${process.env.APP_URL}/share/investigation/${shareToken}`,
      sharedInvestigation,
      isExisting: false,
    });
  } catch (error) {
    console.error("Failed to create shareable link:", error);
    res.status(500).json({
      error: "Failed to create shareable link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get shared investigation details
export const getSharedInvestigation = async (req: Request, res: Response) => {
  try {
    const { shareToken } = req.params;

    // Find shared investigation with protocol information
    const sharedInvestigation = await prisma.sharedInvestigation.findUnique({
      where: {
        shareToken,
      },
      include: {
        investigation: {
          include: {
            cluster: {
              select: {
                clusterName: true,
                status: true,
              },
            },
            protocol: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!sharedInvestigation) {
      res.status(404).json({
        error: "Shared investigation not found",
      });
      return;
    }

    // Check if share link is expired or inactive
    if (
      !sharedInvestigation.isActive ||
      (sharedInvestigation.expiresAt &&
        sharedInvestigation.expiresAt < new Date())
    ) {
      res.status(403).json({
        error: "This share link has expired or is no longer active",
      });
      return;
    }

    // Increment view count
    await prisma.sharedInvestigation.update({
      where: { id: sharedInvestigation.id },
      data: {
        viewCount: { increment: 1 },
      },
    });

    // Prepare response data with protocol name and description
    const responseData = {
      investigation: {
        ...sharedInvestigation.investigation,
        name: sharedInvestigation.investigation.protocol?.name || null,
        description: sharedInvestigation.investigation.protocol?.description || null,
        sharedBy: sharedInvestigation.createdBy.name,
        sharedAt: sharedInvestigation.createdAt,
        expiresAt: sharedInvestigation.expiresAt,
        viewCount: sharedInvestigation.viewCount + 1,
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Failed to get shared investigation:", error);
    res.status(500).json({
      error: "Failed to get shared investigation",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Revoke shared link
export const revokeShareableLink = async (req: Request, res: Response) => {
  try {
    const { shareToken } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        error: "User authentication required",
      });
      return;
    }

    // Verify ownership and update
    const sharedInvestigation = await prisma.sharedInvestigation.findFirst({
      where: {
        shareToken,
        userId,
      },
    });

    if (!sharedInvestigation) {
      res.status(404).json({
        error:
          "Shared investigation not found or you do not have permission to revoke it",
      });
      return;
    }

    // Deactivate the share link
    await prisma.sharedInvestigation.update({
      where: { id: sharedInvestigation.id },
      data: {
        isActive: false,
      },
    });

    res.status(200).json({
      message: "Share link revoked successfully",
    });
  } catch (error) {
    console.error("Failed to revoke share link:", error);
    res.status(500).json({
      error: "Failed to revoke share link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
