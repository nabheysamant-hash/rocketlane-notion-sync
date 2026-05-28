import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const TARGET_OWNER = "Vipul Gupta";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Received Rocketlane webhook:', JSON.stringify(payload, null, 2));

    const task = payload.data?.task;
    if (!task) {
      return res.status(400).json({ error: 'Invalid payload structure' });
    }

    const taskName = task.taskName || 'Untitled Task';
    const taskId = task.taskId ? String(task.taskId) : '';
    const projectName = task.project?.projectName || '';
    const dueDate = task.dueDate || null;
    const status = task.status?.label || 'Not Started';
    const description = task.taskDescription?.replace(/<[^>]*>/g, '') || '';
    const taskUrl = taskId ? `https://app.rocketlane.com/task/${taskId}` : '';

    const assigneeNames = [];
    if (task.assignees?.members) {
      task.assignees.members.forEach(member => {
        const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
        if (fullName) assigneeNames.push(fullName);
      });
    }

    const taskOwner = assigneeNames.join(', ') || 'Unassigned';

    // Filter: Only sync tasks assigned to Vipul Gupta
    const ownerLower = taskOwner.toLowerCase();
    if (!ownerLower.includes('vipul') && !ownerLower.includes('gupta')) {
      console.log(`Skipping task - Owner "${taskOwner}" does not match "${TARGET_OWNER}"`);
      return res.status(200).json({ 
        message: 'Task skipped - not assigned to Vipul Gupta',
        owner: taskOwner,
        taskName: taskName
      });
    }

    console.log(`Processing task: ${taskName} for owner: ${taskOwner}`);

    const existingPages = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Rocketlane ID',
        rich_text: { equals: taskId }
      }
    });

    const taskProperties = {
      'Name': { title: [{ text: { content: taskName } }] },
      'Rocketlane ID': { rich_text: [{ text: { content: taskId } }] },
      'Owner': { rich_text: [{ text: { content: taskOwner } }] },
      'Project': { rich_text: [{ text: { content: projectName } }] },
      'Status': { select: { name: status } },
      'Last Synced': { date: { start: new Date().toISOString() } }
    };

    if (dueDate) taskProperties['Due Date'] = { date: { start: dueDate } };
    if (taskUrl) taskProperties['Rocketlane URL'] = { url: taskUrl };

    if (existingPages.results.length > 0) {
      const pageId = existingPages.results[0].id;
      await notion.pages.update({ page_id: pageId, properties: taskProperties });
      return res.status(200).json({ message: 'Task updated in Notion', page_id: pageId });
    } else {
      const newPage = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: taskProperties,
        children: description ? [{
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: description } }] }
        }] : []
      });
      return res.status(200).json({ message: 'Task created in Notion', page_id: newPage.id });
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Failed to sync to Notion', details: error.message });
  }
}
