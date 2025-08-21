import { promises as fs } from "fs";
import path from "path";
import { addPost, addSubscriber } from "./index";

async function migrateFromFiles() {
  console.log("Starting migration from files to database...");
  
  try {
    // Migrate posts
    const postsPath = path.join(process.cwd(), "data", "posts.json");
    const postsData = await fs.readFile(postsPath, "utf8");
    const posts = JSON.parse(postsData);
    
    console.log(`Found ${posts.length} posts to migrate`);
    for (const post of posts) {
      await addPost({
        section: post.section,
        title: post.title,
        content: post.content,
        author: post.author,
        tags: post.tags || []
      });
    }
    console.log("Posts migrated successfully");
    
    // Migrate subscribers
    const subscribersPath = path.join(process.cwd(), "data", "subscribers.json");
    const subscribersData = await fs.readFile(subscribersPath, "utf8");
    const subscribers = JSON.parse(subscribersData);
    
    console.log(`Found ${subscribers.length} subscribers to migrate`);
    for (const sub of subscribers) {
      await addSubscriber(sub.email, sub.sections);
    }
    console.log("Subscribers migrated successfully");
    
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFromFiles().catch(console.error);
} 