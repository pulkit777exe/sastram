import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { questions, answers, votes, bookmarks } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { auth, currentUser } from '@clerk/nextjs/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, params.id),
      with: {
        answers: true,
        tags: {
          with: {
            tag: true
          }
        }
      }
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Increment view count
    await db.update(questions)
      .set({ views: (question.views || 0) + 1 })
      .where(eq(questions.id, params.id));

    return NextResponse.json(question);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch question: ' + error }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content } = await request.json();

    const [answer] = await db.insert(answers).values({
      questionId: params.id,
      content,
      authorId: userId,
      authorName: 'User', // You might want to fetch this from Clerk
      authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User',
    }).returning();

    return NextResponse.json(answer);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create answer: ' + error }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, value } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    switch (action) {
      case 'vote': {
        if (typeof value !== 'number' || (value !== 1 && value !== -1)) {
          return NextResponse.json(
            { error: 'Invalid vote value. Must be 1 or -1' }, 
            { status: 400 }
          );
        }

        // Check if user has already voted for this question
        const existingVote = await db.query.votes.findFirst({
          where: and(
            eq(votes.userId, userId),
            eq(votes.questionId, params.id)
          )
        });

        if (existingVote) {
          // If voting the same way, remove the vote
          if (existingVote.value === value) {
            await db.delete(votes)
              .where(eq(votes.id, existingVote.id));

            // Update question votes
            await db.update(questions)
              .set({ votes: questions.votes - value })
              .where(eq(questions.id, params.id));
          } else {
            // If changing vote, update it
            await db.update(votes)
              .set({ value })
              .where(eq(votes.id, existingVote.id));

            // Update question votes (subtract old vote and add new vote)
            await db.update(questions)
              .set({ votes: questions.votes - existingVote.value + value })
              .where(eq(questions.id, params.id));
          }
        } else {
          // Create new vote
          await db.insert(votes).values({
            userId,
            questionId: params.id,
            value
          });

          // Update question votes
          await db.update(questions)
            .set({ votes: questions.votes + value })
            .where(eq(questions.id, params.id));
        }
        break;
      }

      case 'bookmark': {
        const existingBookmark = await db.query.bookmarks.findFirst({
          where: and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.questionId, params.id)
          )
        });

        if (existingBookmark) {
          await db.delete(bookmarks)
            .where(and(
              eq(bookmarks.userId, userId),
              eq(bookmarks.questionId, params.id)
            ));
        } else {
          await db.insert(bookmarks).values({
            userId,
            questionId: params.id
          });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: vote, bookmark' }, 
          { status: 400 }
        );
    }

    // Fetch updated question
    const updatedQuestion = await db.query.questions.findFirst({
      where: eq(questions.id, params.id),
      with: {
        tags: {
          with: {
            tag: true
          }
        },
        answers: true
      }
    });

    if (!updatedQuestion) {
      throw new Error('Failed to fetch updated question');
    }

    return NextResponse.json(updatedQuestion);
  } catch (error) {
    console.error('Error in PATCH /api/questions/[id]:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return NextResponse.json(
      { error: 'Failed to update question', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
} 