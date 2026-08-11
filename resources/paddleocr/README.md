# PaddleOCR runtime assets

Run `npm run ocr:models` before packaging. The download script installs the
PP-OCRv6 small detection/recognition ONNX models and the matching Simplified
Chinese dictionary. The ONNX models come from the official PaddlePaddle
`PP-OCRv6_small_det_onnx` and `PP-OCRv6_small_rec_onnx` repositories; the
runtime-compatible dictionary comes from `x3zvawq/paddleocr-js-onnx`.

The download script pins immutable revisions and verifies these SHA-256 values:

- detector commit `28fe5895c24fd108c19eb3e8479f4ab385fbfc62`, 9,880,512 bytes: `d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e`
- recognizer commit `b8f84f0b80c529de40b4fbb3544b84fa7233a513`, 21,159,378 bytes: `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634`
- dictionary commit `51c2133b5a7ea27b795fa8c400fdbfbd5337dd6a`, 74,947 bytes: `b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d`

Model binaries are intentionally excluded from Git and copied into the app by
electron-builder as external resources.
