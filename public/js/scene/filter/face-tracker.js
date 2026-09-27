// MediaPipe FaceLandmarker loader (VIDEO mode). Loaded lazily with a dynamic import so the
// filter still renders (default face position) if the CDN or model fails.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let shared = null;

export function loadFaceLandmarker() {
  if (shared) return shared;
  shared = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    try {
      return await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch (e) {
      console.warn('[filter] GPU delegate failed, falling back to CPU', e);
      return await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  })();
  shared.catch(() => (shared = null));
  return shared;
}
