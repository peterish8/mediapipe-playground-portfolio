export const MODEL_URLS = Object.freeze({
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  gesture: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  segmenter: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
});

export const CHAT_MODELS = Object.freeze({
  small: {
    label: "Small",
    size: "~249 MB",
    note: "Gemma 3 270M · fastest",
    url: "https://huggingface.co/litert-community/gemma-3-270m-it/resolve/main/gemma3-270m-it-q4_0-web.task",
  },
  medium: {
    label: "Medium",
    size: "~700 MB",
    note: "Gemma 3 1B · balanced",
    url: "https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4-web.task",
  },
  large: {
    label: "Large",
    size: "~2 GB",
    note: "Gemma 4 E2B · strongest",
    url: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task",
  },
});

export const HAND_CONNECTIONS = Object.freeze([
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
]);
