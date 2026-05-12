import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const TARGET_OWNER = "Vipul Gupta"; // Filter for this owner

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    
    // Log incoming webhook for debugging
    console.log('Received Rocketlane webhook:', JSON.stringify(payload, null, 2));

    // Extract task details from Rocketlane payload structure
    const task = payload.data?.task;
    
    if (!task) {
      console.log('No task data found in payload');
      return res.status(400).json({ error: 'Invalid payload structure' });
    }
    
    const taskName = task.taskName || 'Untitled Task';
    const taskId = task.taskId ? String(task.taskId) : '';
    const projectName = task.project?.projectName || '';
    const dueDate = task.dueDate || null;
    const status = task.status?.label || 'Not Started';
    const description = task.taskDescription?.replace(/<[^>]*>/g, '') || ''; // Strip HTML tags
    
    // Build Rocketlane URL (adjust domain if needed)
    const taskUrl = taskId ? `https://app.rocketlane.com/task/${taskId}` : '';
    
    // Extract assignee names from the complex assignees structure
    const assigneeNames = [];
    if (task.assignees?.members) {
      task.assignees.members.forEach(member => {
        const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
        if (fullName) assigneeNames.push(fullName);
      });
    }
    
    const taskOwner = assigneeNames.join(', ') || 'Unassigned';

    // FILTER TEMPORARILY DISABLED FOR TESTING
    // Filter: Only sync if owner matches Vipul Gupta
    /*
    const ownerLower = taskOwner.toLowerCase();
    if (!ownerLower.includes('vipul') && !ownerLower.includes('gupta')) {
      console.log(`Skipping task - Owner "${taskOwner}" does not match "${TARGET_OWNER}"`);
      return res.status(200).json({ 
        message: 'Task skipped - not assigned to Vipul Gupta',
        owner: taskOwner,
        taskName: taskName
      });
    }
    */

    console.log(`Processing task: ${taskName} for owner: ${taskOwner}`);

    // Check if task already exists in Notion (by Rocketlane ID)
    const existingPages = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Rocketlane ID',
        rich_text: {
          equals: taskId
        }
      }
    });

    const taskProperties = {
      'Name': {
        title: [{ text: { content: taskName } }]
      },
      'Rocketlane ID': {
        rich_text: [{ text: { content: taskId } }]
      },
      'Owner': {
        rich_text: [{ text: { content: taskOwner } }]
      },
      'Project': {
        rich_text: [{ text: { content: projectName } }]
      },
      'Status': {
        select: { name: status }
      },
      'Last Synced': {
        date: { start: new Date().toISOString() }
      }
    };

    // Add due date if available
    if (dueDate) {
      taskProperties['Due Date'] = {
        date: { start: dueDate }
      };
    }

    // Add Rocketlane URL if available
    if (taskUrl) {
      taskProperties['Rocketlane URL'] = {
        url: taskUrl
      };
    }

    if (existingPages.results.length > 0) {
      // Update existing page
      const pageId = existingPages.results[0].id;
      await notion.pages.update({
        page_id: pageId,
        properties: taskProperties
      });

      console.log(`Updated existing Notion page: ${pageId}`);
      return res.status(200).json({ 
        message: 'Task updated in Notion',
        page_id: pageId,
        task_name: taskName,
        owner: taskOwner
      });
    } else {
      // Create new page
      const newPage = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: taskProperties,
        children: description ? [{
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: description } }]
          }
        }] : []
      });

      console.log(`Created new Notion page: ${newPage.id}`);
      return res.status(200).json({ 
        message: 'Task created in Notion',
        page_id: newPage.id,
        task_name: taskName,
        owner: taskOwner
      });
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Failed to sync to Notion',
      details: error.message 
    });
  }
}
