import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { URL } from 'url';

const app = express();
app.use(cors());

const TOKEN = process.env.FIGMA_TOKEN || 'figd_pEyfXSqa3yPYKHbEEmLh7BbVOdA8ohD4tn870LMQ';

// Extract file key and node ID from Figma link
function parseFigmaLink(link) {
	try {
		const url = new URL(link);
		const [, , fileKey] = url.pathname.split('/'); // FIXED
		const nodeParam = url.searchParams.get('node-id');

		if (!fileKey || !nodeParam) return null;

		const node = nodeParam.replace(/-/g, ':');
		return { file: fileKey, node };
	} catch (err) {
		console.error('Invalid Figma link:', err);
		return null;
	}
}

// Prune function: only keep whitelisted keys, recursively on children
const whitelist = ['id', 'name', 'type', 'componentProperties', 'children'];

function prune(obj) {
	if (Array.isArray(obj)) {
		return obj.map(prune);
	}
	if (obj !== null && typeof obj === 'object') {
		const out = {};
		for (const key of whitelist) {
			if (key in obj) {
				// recurse into children arrays
				out[key] = prune(obj[key]);
			}
		}
		return out;
	}
	// primitive → pass through (though none expected outside these keys)
	return obj;
}

app.get('/figma-node', async (req, res) => {
	const { figma_link, minified = 'false' } = req.query;

	if (!figma_link) {
		return res.status(400).json({ error: 'Missing figma_link query parameter' });
	}

	const parsed = parseFigmaLink(figma_link);
	if (!parsed) {
		return res.status(400).json({ error: 'Invalid Figma link format' });
	}

	const { file, node } = parsed;
	console.log(`Parsed → file: ${file}, node: ${node}, minified: ${minified}`);

	try {
		const response = await fetch(
			`https://api.figma.com/v1/files/${file}/nodes?ids=${node}`,
			{
				headers: {
					'X-Figma-Token': TOKEN,
				},
			}
		);

		const data = await response.json();
		const nodeData = data?.nodes?.[node]?.document;

		if (!nodeData) {
			return res.status(404).json({ error: 'Node not found in Figma' });
		}

		// Prune the response data
		const slimData = prune(nodeData);

		return res.json(slimData);
	} catch (err) {
		console.error('Error:', err);
		return res.status(500).json({ error: 'Internal Server Error' });
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
