# HLS Adaptive Bitrate Streaming Setup

## Overview
The recording system now uses **HLS (HTTP Live Streaming)** with **Adaptive Bitrate Streaming (ABR)** instead of a single MP4 file. This provides:
- ✅ **Better Quality**: Higher bitrates for better video quality
- ✅ **Adaptive Streaming**: Automatically adjusts quality based on internet speed
- ✅ **Multiple Resolutions**: 1080p, 720p, 480p, and 360p
- ✅ **Smooth Playback**: No buffering issues on slow connections

## S3 Output Structure

After MediaConvert processing completes, the HLS files are stored in S3:

```
recordings/{meetingId}/{timestamp}/final-video/hls/
├── master.m3u8                    # Master playlist (points to all quality levels)
├── main_1080p.m3u8                # 1080p playlist
├── main_1080p00001.ts             # 1080p video segments
├── main_1080p00002.ts
├── ...
├── main_720p.m3u8                 # 720p playlist
├── main_720p00001.ts              # 720p video segments
├── main_720p00002.ts
├── ...
├── main_480p.m3u8                 # 480p playlist
├── main_480p00001.ts              # 480p video segments
├── main_480p00002.ts
├── ...
├── main_360p.m3u8                 # 360p playlist
├── main_360p00001.ts              # 360p video segments
├── main_360p00002.ts
└── ...
```

## Quality Levels

| Resolution | Bitrate | Audio Bitrate | Use Case |
|------------|---------|---------------|----------|
| **1080p** | 8 Mbps | 192 kbps | High-speed internet (10+ Mbps) |
| **720p** | 5 Mbps | 128 kbps | Good internet (5-10 Mbps) |
| **480p** | 2.5 Mbps | 96 kbps | Moderate internet (2-5 Mbps) |
| **360p** | 1 Mbps | 64 kbps | Slow internet (<2 Mbps) |

## Video Settings

### Common Settings (All Qualities)
- **Codec**: H.264 (Main Profile)
- **Framerate**: Source framerate
- **GOP Size**: 90 frames (~3 seconds at 30fps)
- **Quality**: Single Pass HQ
- **Segment Length**: 10 seconds
- **Encoding**: CABAC (better compression)
- **Adaptive Quantization**: High

### Advanced Features
- **Spatial Adaptive Quantization**: Enabled
- **Temporal Adaptive Quantization**: Enabled
- **Scene Change Detection**: Enabled
- **Anti-aliasing**: Enabled
- **Sharpness**: 50

## How It Works

1. **Recording Stops**: Host stops the meeting recording
2. **MediaConvert Job**: System creates a MediaConvert job with 4 output renditions
3. **Processing**: MediaConvert encodes the video in all 4 quality levels simultaneously
4. **HLS Output**: Creates master playlist and individual playlists for each quality
5. **Adaptive Playback**: Video players automatically switch between qualities based on bandwidth

## Playback

To play the HLS video, use an HLS-compatible player:

### Browser (Using Video.js)
```html
<video id="my-video" class="video-js" controls preload="auto">
  <source src="https://your-s3-bucket.s3.amazonaws.com/recordings/{meetingId}/{timestamp}/final-video/hls/master.m3u8" type="application/x-mpegURL">
</video>

<script src="https://vjs.zencdn.net/8.6.1/video.min.js"></script>
<script>
  var player = videojs('my-video');
</script>
```

### Browser (Using HLS.js)
```javascript
import Hls from 'hls.js';

const video = document.getElementById('video');
const videoSrc = 'https://your-s3-bucket.s3.amazonaws.com/recordings/.../master.m3u8';

if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(videoSrc);
  hls.attachMedia(video);
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // Safari native HLS support
  video.src = videoSrc;
}
```

### iOS/Safari
Safari has native HLS support - just use a regular `<video>` tag:
```html
<video controls>
  <source src="master.m3u8" type="application/x-mpegURL">
</video>
```

## S3 CORS Configuration

To allow browser playback, configure CORS on your S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

## Cost Comparison

### Old (Single MP4)
- 10-minute 720p video @ 5 Mbps = ~$0.075

### New (HLS with 4 qualities)
- 10-minute video with 4 renditions = ~$0.30
  - 1080p @ 8 Mbps
  - 720p @ 5 Mbps
  - 480p @ 2.5 Mbps
  - 360p @ 1 Mbps

**Note**: The cost is 4x higher because we're encoding 4 versions, but the user experience is significantly better.

## Bandwidth Savings

While encoding costs more, **adaptive streaming saves bandwidth**:
- Users on slow connections automatically get 360p/480p (lower data usage)
- Users on fast connections get 1080p (best quality)
- No buffering or quality degradation during playback

## Processing Time

MediaConvert processes all 4 quality levels in **parallel**, so total processing time is only slightly longer than encoding a single quality:
- Single 720p: ~1x realtime (10 min video = 10 min processing)
- 4 qualities: ~1.2-1.5x realtime (10 min video = 12-15 min processing)

## Monitoring

Check MediaConvert job status:
```bash
aws mediaconvert describe-job \
  --endpoint-url https://mediaconvert.us-east-1.amazonaws.com \
  --id {jobId}
```

## Troubleshooting

### Issue: "No audio in some quality levels"
- **Solution**: Check that all renditions have `AudioDescriptions` configured

### Issue: "Player not switching quality levels"
- **Solution**: Ensure master.m3u8 is properly generated and lists all renditions

### Issue: "CORS errors when playing video"
- **Solution**: Configure S3 bucket CORS policy (see above)

### Issue: "Slow quality switching"
- **Solution**: HLS typically takes 1-2 segments (10-20 seconds) to switch quality

## Next Steps

1. ✅ HLS output configured with 4 quality levels
2. ⏳ Create video player component (Video.js or HLS.js)
3. ⏳ Add quality selector UI
4. ⏳ Test adaptive bitrate switching
5. ⏳ Configure S3 CORS for browser playback
6. ⏳ Add CloudFront CDN for faster global delivery

## Benefits Summary

✅ **Better Quality**: Up to 1080p @ 8 Mbps (was 720p @ 5 Mbps)
✅ **Adaptive**: Automatically adjusts to network conditions
✅ **No Buffering**: Switches to lower quality instead of buffering
✅ **Future-Proof**: Industry standard for video streaming
✅ **Device Compatible**: Works on all devices (iOS, Android, Desktop)
✅ **Bandwidth Efficient**: Users only download the quality they need
