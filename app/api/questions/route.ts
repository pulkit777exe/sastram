import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { questions, tags, questionTags } from '@/lib/schema';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    console.log('Fetching questions...');
    const allQuestions = await db.query.questions.findMany({
      with: {
        tags: {
          with: {
            tag: true
          }
        },
        answers: true
      },
      orderBy: (questions, { desc }) => [desc(questions.createdAt)]
    });
    console.log('Questions fetched successfully:', allQuestions.length);

    // Transform the data to match the frontend's expected format
    const formattedQuestions = allQuestions.map(q => {
      try {
        return {
          id: q.id,
          title: q.title,
          content: q.content,
          votes: q.votes || 0,
          views: q.views || 0,
          authorId: q.authorId,
          authorName: q.authorName,
          authorAvatar: q.authorAvatar,
          createdAt: q.createdAt?.toISOString() || new Date().toISOString(),
          tags: q.tags,
          answers: q.answers
        };
      } catch (error) {
        console.error('Error formatting question:', q.id, error);
        throw error;
      }
    });

    return NextResponse.json(formattedQuestions);
  } catch (error) {
    console.error('Error in GET /api/questions:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return NextResponse.json(
      { error: 'Failed to fetch questions', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404 }
      );
    }

    const { title, content, tags: questionTags } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' }, 
        { status: 400 }
      );
    }

    // Create question
    const [question] = await db.insert(questions).values({
      title,
      content,
      authorId: userId,
      authorName: user.fullName || user.username || 'Anonymous',
      authorAvatar: user.imageUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anonymous',
      votes: 0,
      views: 0
    }).returning();

    // Handle tags
    if (questionTags && Array.isArray(questionTags)) {
      for (const tagName of questionTags) {
        const [tag] = await db.insert(tags)
          .values({ name: tagName })
          .onConflictDoNothing()
          .returning();

        if (tag) {
          await db.insert(questionTags).values({
            questionId: question.id,
            tagId: tag.id,
          });
        }
      }
    }

    // Fetch the complete question with tags and answers
    const completeQuestion = await db.query.questions.findFirst({
      where: eq(questions.id, question.id),
      with: {
        tags: {
          with: {
            tag: true
          }
        },
        answers: true
      }
    });

    if (!completeQuestion) {
      throw new Error('Failed to fetch created question');
    }

    return NextResponse.json(completeQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    return NextResponse.json(
      { error: 'Failed to create question' }, 
      { status: 500 }
    );
  }
} 