import backendWorker from "../backend/src/index.js";

export const onRequest = async (context) => {
  return backendWorker.fetch(context.request, context.env, context);
};
