import {getStore} from '@netlify/blobs';
import {createHandler} from '../lib/editor-handler.mjs';
export default (request, context) => createHandler(getStore({name:'hansol-portfolio-production',consistency:'strong'}))(request, context);
