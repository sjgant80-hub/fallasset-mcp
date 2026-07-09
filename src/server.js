// FallAsset MCP server (stdio)
// Wraps @ai-native-solutions/fallasset-sdk as MCP tools + resources.
//
// State is held in-process for the session. A caller adds files, then
// invokes tools to rate / tag / label / sort / filter / route intents.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import sdk, {
  defaultState, t0Route, execAction, visibleFiles,
  setRating, addTags, setLabel, setCaption,
  newCollection, toggleColl, allTags,
  exportMetadataJSON, importMetadataJSON,
  setSort, setFilter, clearFilters, setView,
  editsToCSSFilter, ensureMeta
} from '@ai-native-solutions/fallasset-sdk';

const state = defaultState();

function ok(text) { return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }] }; }
function err(msg) { return { content: [{ type: 'text', text: 'error: ' + msg }], isError: true }; }

const server = new Server(
  { name: 'fallasset-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ─── Tools ───
const TOOLS = [
  {
    name: 'fallasset_add_files',
    description: 'Register files into the FallAsset library. Each file: {id, name, size, lastModified, type}.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              size: { type: 'number' },
              lastModified: { type: 'number' },
              type: { type: 'string' }
            },
            required: ['id', 'name']
          }
        }
      },
      required: ['files']
    }
  },
  {
    name: 'fallasset_route',
    description: 'Run a natural-language intent through the offline T0 router. Handles rate/tag/label/sort/filter/view/rotate/export/crop.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'e.g. "show 5 star", "rate 4", "tag sunset", "sort by date desc"' },
        select: { type: 'array', items: { type: 'string' }, description: 'file ids to select before routing (optional)' }
      },
      required: ['query']
    }
  },
  {
    name: 'fallasset_exec',
    description: 'Execute a strict-JSON intent {action, args}. Actions: filter_rating, filter_label, filter_tag, filter_clear, sort, view, rate_sel, tag_sel, label_sel, caption_sel, rotate, reset_edits, export, add_to_collection.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        args: { type: 'object' },
        select: { type: 'array', items: { type: 'string' } }
      },
      required: ['action']
    }
  },
  {
    name: 'fallasset_list',
    description: 'Return the currently visible (filtered + sorted) list of files with their metadata.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'fallasset_meta',
    description: 'Set or read metadata for one file. Provide only the fields you want to write; omit to read.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        caption: { type: 'string' },
        tags: { type: 'string', description: 'comma-separated' },
        rating: { type: 'number' },
        label: { type: 'string', enum: ['red', 'yellow', 'green', 'blue', 'violet', 'none'] }
      },
      required: ['id']
    }
  },
  {
    name: 'fallasset_collection',
    description: 'Create a new collection, or toggle a file in/out of an existing one.',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['new', 'toggle', 'list'] },
        name: { type: 'string' },
        cid: { type: 'string' },
        fid: { type: 'string' }
      },
      required: ['op']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (args.select && Array.isArray(args.select)) {
      state.sel.clear();
      args.select.forEach(id => state.sel.add(id));
    }
    switch (name) {
      case 'fallasset_add_files': {
        (args.files || []).forEach(f => {
          if (!state.files.find(x => x.id === f.id)) state.files.push(f);
          ensureMeta(state, f.id);
        });
        return ok(`added ${args.files?.length || 0} files (total ${state.files.length})`);
      }
      case 'fallasset_route': {
        const r = t0Route(state, args.query || '');
        return ok(r || { msg: 'no match — try suggestions like "show 5 star", "rate 4", "tag sunset"' });
      }
      case 'fallasset_exec': {
        const msg = execAction(state, { action: args.action, args: args.args || {} });
        return ok({ msg: msg || 'noop', filt: state.filt, sort: state.sort, view: state.view });
      }
      case 'fallasset_list': {
        const list = visibleFiles(state).map(f => ({
          id: f.id, name: f.name, size: f.size, type: f.type,
          rating: state.meta[f.id]?.rating || 0,
          label: state.meta[f.id]?.label || 'none',
          tags: state.meta[f.id]?.tags || '',
          caption: state.meta[f.id]?.caption || ''
        }));
        return ok({ count: list.length, files: list });
      }
      case 'fallasset_meta': {
        const m = ensureMeta(state, args.id);
        const writes = ['title', 'caption', 'tags', 'rating', 'label'];
        const wrote = {};
        writes.forEach(k => { if (args[k] !== undefined) { m[k] = args[k]; wrote[k] = args[k]; } });
        if (Object.keys(wrote).length === 0) return ok(m);
        return ok({ wrote, meta: m });
      }
      case 'fallasset_collection': {
        if (args.op === 'new') {
          const c = newCollection(state, args.name || 'untitled');
          return ok(c || 'failed');
        }
        if (args.op === 'toggle') {
          const r = toggleColl(state, args.cid, args.fid);
          return ok({ result: r || 'not found', cid: args.cid, fid: args.fid });
        }
        if (args.op === 'list') return ok(state.collections);
        return err('unknown op');
      }
    }
    return err('unknown tool: ' + name);
  } catch (e) {
    return err(String(e?.message || e));
  }
});

// ─── Resources ───
const RESOURCES = [
  { uri: 'fallasset://state', name: 'state', description: 'Current library state snapshot', mimeType: 'application/json' },
  { uri: 'fallasset://metadata', name: 'metadata', description: 'Metadata JSON export (meta + collections)', mimeType: 'application/json' },
  { uri: 'fallasset://tags', name: 'tags', description: 'All tags in the library', mimeType: 'application/json' }
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  let text;
  if (uri === 'fallasset://state') {
    text = JSON.stringify({
      files: state.files.length,
      view: state.view,
      sort: state.sort,
      filt: state.filt,
      collections: state.collections.length,
      selected: state.sel.size
    }, null, 2);
  } else if (uri === 'fallasset://metadata') {
    text = JSON.stringify(exportMetadataJSON(state), null, 2);
  } else if (uri === 'fallasset://tags') {
    text = JSON.stringify(allTags(state), null, 2);
  } else {
    throw new Error('unknown resource: ' + uri);
  }
  return { contents: [{ uri, mimeType: 'application/json', text }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('fallasset-mcp v1.0.0 · stdio ready');
