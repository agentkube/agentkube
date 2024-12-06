import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';

// Get user's current subscription
export const getUserSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found for this user' });
      return;
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
};

// Update user's subscription
export const updateSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { 
      planId, 
      billingPeriod,
      status 
    } = req.body;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify plan exists if planId is provided
    if (planId) {
      const plan = await prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        res.status(404).json({ error: 'Plan not found' });
        return;
      }
    }

    // Get current subscription to calculate amount
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: true
      }
    });

    if (!currentSubscription) {
      res.status(404).json({ error: 'No subscription found for this user' });
      return;
    }

    // Calculate new amount based on plan and billing period
    let amount = currentSubscription.amount;
    if (planId || billingPeriod) {
      const newPlan = planId 
        ? await prisma.plan.findUnique({ where: { id: planId } })
        : currentSubscription.plan;

      if (!newPlan) {
        res.status(404).json({ error: 'Plan not found' });
        return;
      }

      const newBillingPeriod = billingPeriod || currentSubscription.billingPeriod;
      amount = newBillingPeriod === 'YEARLY' ? newPlan.yearlyPrice : newPlan.monthlyPrice;
    }

    // Update subscription
    const updatedSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        ...(planId && { planId }),
        ...(billingPeriod && { billingPeriod }),
        ...(status && { status }),
        amount,
        updatedAt: new Date()
      },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    res.json(updatedSubscription);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};

// Cancel user's subscription
export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if subscription exists and is active
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found for this user' });
      return;
    }

    if (subscription.status === 'CANCELED') {
      res.status(400).json({ error: 'Subscription is already canceled' });
      return;
    }

    // Update subscription status to canceled
    const canceledSubscription = await prisma.subscription.update({
      where: { userId },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        updatedAt: new Date()
      },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    res.json(canceledSubscription);
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

// Delete user's subscription
export const deleteSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if subscription exists
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      res.status(404).json({ error: 'No subscription found for this user' });
      return;
    }

    // Delete the subscription
    await prisma.subscription.delete({
      where: { userId }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
};