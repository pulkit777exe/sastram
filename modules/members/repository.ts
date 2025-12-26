import { prisma } from "@/lib/infrastructure/prisma";
import { SectionRole, MemberStatus } from "@prisma/client";

export async function addMember(
  sectionId: string,
  userId: string,
  role: SectionRole = "MEMBER"
) {
  return prisma.sectionMember.create({
    data: {
      sectionId,
      userId,
      role,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

export async function removeMember(sectionId: string, userId: string) {
  return prisma.sectionMember.updateMany({
    where: {
      sectionId,
      userId,
    },
    data: {
      status: "LEFT",
    },
  });
}

export async function updateMemberRole(
  sectionId: string,
  userId: string,
  role: SectionRole
) {
  return prisma.sectionMember.updateMany({
    where: {
      sectionId,
      userId,
    },
    data: {
      role,
    },
  });
}

export async function getSectionMembers(sectionId: string) {
  return prisma.sectionMember.findMany({
    where: {
      sectionId,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: [
      { role: "asc" }, // OWNER first, then MODERATOR, then MEMBER
      { joinedAt: "asc" },
    ],
  });
}

export async function getUserMemberships(userId: string) {
  return prisma.sectionMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });
}

export async function getMemberRole(sectionId: string, userId: string) {
  const member = await prisma.sectionMember.findUnique({
    where: {
      sectionId_userId: {
        sectionId,
        userId,
      },
    },
    select: {
      role: true,
      status: true,
    },
  });

  return member;
}

export async function isMember(sectionId: string, userId: string) {
  const member = await getMemberRole(sectionId, userId);
  return member?.status === "ACTIVE";
}
