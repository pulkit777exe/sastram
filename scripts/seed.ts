import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as schema from '../lib/schema';
dotenv.config();

const DATABASE_URL = process.env.NEXT_PUBLIC_DATABASE_URL;

const sql = neon(DATABASE_URL!);
const db = drizzle(sql, { schema });
const { questions, answers, tags, questionTags } = schema;

async function seed() {
  // Sample events (questions)
  const events = [
    {
      title: 'Book Fair',
      content: 'Explore exciting books from a variety of genres and meet your favorite authors. A great opportunity for book lovers of all ages.',
      date: '2024-03-15',
      tags: ['Books', 'Fair'],
    },
    {
      title: 'Science Exhibition for Students',
      content: 'Attention students! Get ready for an exciting opportunity on April 10! Showcase your engineering and scientific talents in our science exhibition.',
      date: '2024-04-10',
      tags: ['Science', 'Exhibition'],
    },
    {
      title: 'Talent Show "Showtime" Evening',
      content: 'Prepare to be dazzled by the talents of our students in this fun-filled evening of music, dance, and more.',
      date: '2024-05-25',
      tags: ['Talent', 'Show'],
    },
    {
      title: 'Charity Marathon',
      content: 'Join us in running for those in need and making the world a better place.',
      date: '2024-06-05',
      tags: ['Charity', 'Marathon'],
    },
    {
      title: 'Spelling Bee: Battle of Word Knowledge',
      content: 'Showcase your spelling skills and compete for the English language crown.',
      date: '2024-07-12',
      tags: ['Spelling', 'Competition'],
    },
    {
      title: 'Unleash Your Creativity',
      content: 'A platform to celebrate artistic expression and creative thinking.',
      date: '2024-08-20',
      tags: ['Creativity', 'Art'],
    },
  ];

  // Insert events and tags
  for (const event of events) {
    const [question] = await db.insert(questions).values({
      id: uuidv4(),
      title: event.title,
      content: event.content,
      authorId: 'seed-user',
      authorName: 'System',
      authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=System',
      createdAt: new Date(event.date),
    }).returning();
    for (const tagName of event.tags) {
      const [tag] = await db.insert(tags).values({ name: tagName }).onConflictDoNothing().returning();
      if (tag) {
        await db.insert(questionTags).values({ questionId: question.id, tagId: tag.id });
      }
    }
  }

  // Add sample comments (answers) to the Science Exhibition event
  const scienceEvent = await db.query.questions.findFirst({ where: (fields, { eq }) => eq(fields.title, 'Science Exhibition for Students') });
  if (scienceEvent) {
    await db.insert(answers).values([
      {
        id: uuidv4(),
        questionId: scienceEvent.id,
        content: 'Attention students! Get ready for an exciting opportunity on April 10! We invite you to showcase your engineering and scientific talents in our science exhibition. It\'s a fantastic chance to apply your STEM knowledge. Don\'t miss out on the chance to shine and share your innovative ideas with the community!',
        authorId: 'user-1',
        authorName: 'Lily King',
        authorAvatar: 'https://randomuser.me/api/portraits/women/1.jpg',
        createdAt: new Date('2024-04-10T09:00:00Z'),
      },
      {
        id: uuidv4(),
        questionId: scienceEvent.id,
        content: 'Wow! This sounds absolutely amazing! Thank you for giving us the chance to showcase our talents. Can\'t wait for April 10th — it\'s going to be an incredible opportunity to apply our STEM knowledge and share our innovative ideas. Thank you for always encouraging and supporting us!',
        authorId: 'user-2',
        authorName: 'Adam Lincoln',
        authorAvatar: 'https://randomuser.me/api/portraits/men/2.jpg',
        createdAt: new Date('2024-04-10T10:00:00Z'),
      },
      {
        id: uuidv4(),
        questionId: scienceEvent.id,
        content: 'Fantastic news! Thank you for providing such an exciting opportunity. Count me in for April 10th! It\'s a great chance to dive into the world of science and engineering. Appreciate the encouragement and support — looking forward to shining and sharing our creativity with everyone!',
        authorId: 'user-3',
        authorName: 'Scarlett Young',
        authorAvatar: 'https://randomuser.me/api/portraits/women/3.jpg',
        createdAt: new Date('2024-04-10T11:00:00Z'),
      },
      {
        id: uuidv4(),
        questionId: scienceEvent.id,
        content: 'Wow, what an incredible opportunity! Thank you for providing us with a platform to showcase our talents. Super excited for April 10th! Ready to dive into the world of science and innovation. Grateful for all the support!',
        authorId: 'user-4',
        authorName: 'Alex Francis',
        authorAvatar: 'https://randomuser.me/api/portraits/men/4.jpg',
        createdAt: new Date('2024-04-10T12:00:00Z'),
      },
    ]);
  }

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
}); 