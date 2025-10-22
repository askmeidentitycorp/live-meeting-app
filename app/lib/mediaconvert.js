import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMeeting, updateMeetingHost } from '../lib/meetingStorage.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Create a MediaConvert job for the given meetingId. Validates that the invoking user is the meeting host.
 * Returns the created jobId and output key.
 */
export async function createMediaConvertJobForMeeting(meetingId, invokingUserEmail) {
  if (!meetingId) throw new Error('meetingId is required');

  const meetingData = await getMeeting(meetingId);
  if (!meetingData) throw new Error('Meeting not found');

  // Verify user is the host
  if (meetingData.host?.email !== invokingUserEmail) {
    throw new Error('Only the meeting host can process recordings');
  }

  const recording = meetingData.host?.recording;
  if (!recording) throw new Error('No recording found for this meeting');

  const bucket = recording.s3Bucket;
  const inputPrefix = `${recording.s3Prefix}/composited-video/`;
  const outputPrefix = `${recording.s3Prefix}/final-video/`;

  // List MP4 clips
  const listCommand = new ListObjectsV2Command({ Bucket: bucket, Prefix: inputPrefix });
  const listResponse = await s3Client.send(listCommand);

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    throw new Error('No video clips found to process');
  }

  const clips = listResponse.Contents
    .filter(obj => obj.Key.endsWith('.mp4'))
    .sort((a, b) => a.Key.localeCompare(b.Key));

  if (clips.length === 0) {
    throw new Error('No MP4 clips found');
  }

  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
  const mediaConvertClient = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint });

  const jobParams = {
    Role: process.env.AWS_MEDIACONVERT_ROLE,
    Settings: {
      Inputs: clips.map((clip) => ({
        AudioSelectors: {
          "Audio Selector 1": { DefaultSelection: "DEFAULT" }
        },
        VideoSelector: {},
        TimecodeSource: "ZEROBASED",
        FileInput: `s3://${bucket}/${clip.Key}`
      })),
      OutputGroups: [
        // HLS Output Group with Adaptive Bitrate Streaming
        {
          Name: "Apple HLS",
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              SegmentLength: 10,
              MinSegmentLength: 0,
              Destination: `s3://${bucket}/${outputPrefix}hls/`,
              SegmentControl: "SEGMENTED_FILES",
              ManifestDurationFormat: "INTEGER",
              StreamInfResolution: "INCLUDE",
              ClientCache: "ENABLED",
              TimedMetadataId3Period: 10,
              CodecSpecification: "RFC_4281",
              OutputSelection: "MANIFESTS_AND_SEGMENTS",
              CaptionLanguageSetting: "OMIT",
              TimedMetadataId3Frame: "PRIV",
              ProgramDateTime: "EXCLUDE",
              DirectoryStructure: "SINGLE_DIRECTORY",
              SegmentModifier: "$dt$"
            }
          },
          Outputs: [
            // 1080p - High Quality
            {
              ContainerSettings: {
                Container: "M3U8",
                M3u8Settings: {
                  AudioFramesPerPes: 4,
                  PcrControl: "PCR_EVERY_PES_PACKET",
                  PmtPid: 480,
                  PrivateMetadataPid: 503,
                  ProgramNumber: 1,
                  PatInterval: 0,
                  PmtInterval: 0,
                  VideoPid: 481,
                  AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
                }
              },
              VideoDescription: {
                Width: 1920,
                Height: 1080,
                ScalingBehavior: "DEFAULT",
                TimecodeInsertion: "DISABLED",
                AntiAlias: "ENABLED",
                Sharpness: 50,
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    InterlaceMode: "PROGRESSIVE",
                    NumberReferenceFrames: 3,
                    Syntax: "DEFAULT",
                    Softness: 0,
                    GopClosedCadence: 1,
                    GopSize: 90,
                    Slices: 1,
                    GopBReference: "DISABLED",
                    SlowPal: "DISABLED",
                    SpatialAdaptiveQuantization: "ENABLED",
                    TemporalAdaptiveQuantization: "ENABLED",
                    FlickerAdaptiveQuantization: "DISABLED",
                    EntropyEncoding: "CABAC",
                    Bitrate: 8000000,
                    FramerateControl: "INITIALIZE_FROM_SOURCE",
                    RateControlMode: "CBR",
                    CodecProfile: "MAIN",
                    Telecine: "NONE",
                    MinIInterval: 0,
                    AdaptiveQuantization: "HIGH",
                    CodecLevel: "AUTO",
                    FieldEncoding: "PAFF",
                    SceneChangeDetect: "ENABLED",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    FramerateConversionAlgorithm: "DUPLICATE_DROP",
                    UnregisteredSeiTimecode: "DISABLED",
                    GopSizeUnits: "FRAMES",
                    ParControl: "INITIALIZE_FROM_SOURCE",
                    NumberBFramesBetweenReferenceFrames: 2,
                    RepeatPps: "DISABLED"
                  }
                },
                AfdSignaling: "NONE",
                DropFrameTimecode: "ENABLED",
                RespondToAfd: "NONE",
                ColorMetadata: "INSERT"
              },
              AudioDescriptions: [
                {
                  AudioTypeControl: "FOLLOW_INPUT",
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      AudioDescriptionBroadcasterMix: "NORMAL",
                      Bitrate: 192000,
                      RateControlMode: "CBR",
                      CodecProfile: "LC",
                      CodingMode: "CODING_MODE_2_0",
                      RawFormat: "NONE",
                      SampleRate: 48000,
                      Specification: "MPEG4"
                    }
                  },
                  LanguageCodeControl: "FOLLOW_INPUT"
                }
              ],
              NameModifier: "_1080p"
            },
            // 720p - High Quality
            {
              ContainerSettings: {
                Container: "M3U8",
                M3u8Settings: {
                  AudioFramesPerPes: 4,
                  PcrControl: "PCR_EVERY_PES_PACKET",
                  PmtPid: 480,
                  PrivateMetadataPid: 503,
                  ProgramNumber: 1,
                  PatInterval: 0,
                  PmtInterval: 0,
                  VideoPid: 481,
                  AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
                }
              },
              VideoDescription: {
                Width: 1280,
                Height: 720,
                ScalingBehavior: "DEFAULT",
                TimecodeInsertion: "DISABLED",
                AntiAlias: "ENABLED",
                Sharpness: 50,
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    InterlaceMode: "PROGRESSIVE",
                    NumberReferenceFrames: 3,
                    Syntax: "DEFAULT",
                    Softness: 0,
                    GopClosedCadence: 1,
                    GopSize: 90,
                    Slices: 1,
                    GopBReference: "DISABLED",
                    SlowPal: "DISABLED",
                    SpatialAdaptiveQuantization: "ENABLED",
                    TemporalAdaptiveQuantization: "ENABLED",
                    FlickerAdaptiveQuantization: "DISABLED",
                    EntropyEncoding: "CABAC",
                    Bitrate: 5000000,
                    FramerateControl: "INITIALIZE_FROM_SOURCE",
                    RateControlMode: "CBR",
                    CodecProfile: "MAIN",
                    Telecine: "NONE",
                    MinIInterval: 0,
                    AdaptiveQuantization: "HIGH",
                    CodecLevel: "AUTO",
                    FieldEncoding: "PAFF",
                    SceneChangeDetect: "ENABLED",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    FramerateConversionAlgorithm: "DUPLICATE_DROP",
                    UnregisteredSeiTimecode: "DISABLED",
                    GopSizeUnits: "FRAMES",
                    ParControl: "INITIALIZE_FROM_SOURCE",
                    NumberBFramesBetweenReferenceFrames: 2,
                    RepeatPps: "DISABLED"
                  }
                },
                AfdSignaling: "NONE",
                DropFrameTimecode: "ENABLED",
                RespondToAfd: "NONE",
                ColorMetadata: "INSERT"
              },
              AudioDescriptions: [
                {
                  AudioTypeControl: "FOLLOW_INPUT",
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      AudioDescriptionBroadcasterMix: "NORMAL",
                      Bitrate: 128000,
                      RateControlMode: "CBR",
                      CodecProfile: "LC",
                      CodingMode: "CODING_MODE_2_0",
                      RawFormat: "NONE",
                      SampleRate: 48000,
                      Specification: "MPEG4"
                    }
                  },
                  LanguageCodeControl: "FOLLOW_INPUT"
                }
              ],
              NameModifier: "_720p"
            },
            // 480p - Medium Quality
            {
              ContainerSettings: {
                Container: "M3U8",
                M3u8Settings: {
                  AudioFramesPerPes: 4,
                  PcrControl: "PCR_EVERY_PES_PACKET",
                  PmtPid: 480,
                  PrivateMetadataPid: 503,
                  ProgramNumber: 1,
                  PatInterval: 0,
                  PmtInterval: 0,
                  VideoPid: 481,
                  AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
                }
              },
              VideoDescription: {
                Width: 854,
                Height: 480,
                ScalingBehavior: "DEFAULT",
                TimecodeInsertion: "DISABLED",
                AntiAlias: "ENABLED",
                Sharpness: 50,
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    InterlaceMode: "PROGRESSIVE",
                    NumberReferenceFrames: 3,
                    Syntax: "DEFAULT",
                    Softness: 0,
                    GopClosedCadence: 1,
                    GopSize: 90,
                    Slices: 1,
                    GopBReference: "DISABLED",
                    SlowPal: "DISABLED",
                    SpatialAdaptiveQuantization: "ENABLED",
                    TemporalAdaptiveQuantization: "ENABLED",
                    FlickerAdaptiveQuantization: "DISABLED",
                    EntropyEncoding: "CABAC",
                    Bitrate: 2500000,
                    FramerateControl: "INITIALIZE_FROM_SOURCE",
                    RateControlMode: "CBR",
                    CodecProfile: "MAIN",
                    Telecine: "NONE",
                    MinIInterval: 0,
                    AdaptiveQuantization: "HIGH",
                    CodecLevel: "AUTO",
                    FieldEncoding: "PAFF",
                    SceneChangeDetect: "ENABLED",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    FramerateConversionAlgorithm: "DUPLICATE_DROP",
                    UnregisteredSeiTimecode: "DISABLED",
                    GopSizeUnits: "FRAMES",
                    ParControl: "INITIALIZE_FROM_SOURCE",
                    NumberBFramesBetweenReferenceFrames: 2,
                    RepeatPps: "DISABLED"
                  }
                },
                AfdSignaling: "NONE",
                DropFrameTimecode: "ENABLED",
                RespondToAfd: "NONE",
                ColorMetadata: "INSERT"
              },
              AudioDescriptions: [
                {
                  AudioTypeControl: "FOLLOW_INPUT",
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      AudioDescriptionBroadcasterMix: "NORMAL",
                      Bitrate: 96000,
                      RateControlMode: "CBR",
                      CodecProfile: "LC",
                      CodingMode: "CODING_MODE_2_0",
                      RawFormat: "NONE",
                      SampleRate: 48000,
                      Specification: "MPEG4"
                    }
                  },
                  LanguageCodeControl: "FOLLOW_INPUT"
                }
              ],
              NameModifier: "_480p"
            },
            // 360p - Low Quality (for slow connections)
            {
              ContainerSettings: {
                Container: "M3U8",
                M3u8Settings: {
                  AudioFramesPerPes: 4,
                  PcrControl: "PCR_EVERY_PES_PACKET",
                  PmtPid: 480,
                  PrivateMetadataPid: 503,
                  ProgramNumber: 1,
                  PatInterval: 0,
                  PmtInterval: 0,
                  VideoPid: 481,
                  AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
                }
              },
              VideoDescription: {
                Width: 640,
                Height: 360,
                ScalingBehavior: "DEFAULT",
                TimecodeInsertion: "DISABLED",
                AntiAlias: "ENABLED",
                Sharpness: 50,
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    InterlaceMode: "PROGRESSIVE",
                    NumberReferenceFrames: 3,
                    Syntax: "DEFAULT",
                    Softness: 0,
                    GopClosedCadence: 1,
                    GopSize: 90,
                    Slices: 1,
                    GopBReference: "DISABLED",
                    SlowPal: "DISABLED",
                    SpatialAdaptiveQuantization: "ENABLED",
                    TemporalAdaptiveQuantization: "ENABLED",
                    FlickerAdaptiveQuantization: "DISABLED",
                    EntropyEncoding: "CABAC",
                    Bitrate: 1000000,
                    FramerateControl: "INITIALIZE_FROM_SOURCE",
                    RateControlMode: "CBR",
                    CodecProfile: "MAIN",
                    Telecine: "NONE",
                    MinIInterval: 0,
                    AdaptiveQuantization: "HIGH",
                    CodecLevel: "AUTO",
                    FieldEncoding: "PAFF",
                    SceneChangeDetect: "ENABLED",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    FramerateConversionAlgorithm: "DUPLICATE_DROP",
                    UnregisteredSeiTimecode: "DISABLED",
                    GopSizeUnits: "FRAMES",
                    ParControl: "INITIALIZE_FROM_SOURCE",
                    NumberBFramesBetweenReferenceFrames: 2,
                    RepeatPps: "DISABLED"
                  }
                },
                AfdSignaling: "NONE",
                DropFrameTimecode: "ENABLED",
                RespondToAfd: "NONE",
                ColorMetadata: "INSERT"
              },
              AudioDescriptions: [
                {
                  AudioTypeControl: "FOLLOW_INPUT",
                  AudioSourceName: "Audio Selector 1",
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      AudioDescriptionBroadcasterMix: "NORMAL",
                      Bitrate: 64000,
                      RateControlMode: "CBR",
                      CodecProfile: "LC",
                      CodingMode: "CODING_MODE_2_0",
                      RawFormat: "NONE",
                      SampleRate: 48000,
                      Specification: "MPEG4"
                    }
                  },
                  LanguageCodeControl: "FOLLOW_INPUT"
                }
              ],
              NameModifier: "_360p"
            }
          ]
        }
      ]
    },
    AccelerationSettings: { Mode: "DISABLED" }
  };

  const createJobCommand = new CreateJobCommand(jobParams);
  const jobResponse = await mediaConvertClient.send(createJobCommand);

  const jobId = jobResponse.Job?.Id;
  const outputKey = `${outputPrefix}hls/master.m3u8`; // HLS master playlist

  // Update meeting data with MediaConvert job info
  await updateMeetingHost(meetingId, {
    ...meetingData.host,
    recording: {
      ...recording,
      mediaConvertJobId: jobId,
      mediaConvertStatus: "SUBMITTED",
      finalVideoKey: outputKey,
      hlsOutputPath: `${outputPrefix}hls/`,
      processStartedAt: new Date().toISOString(),
      clipsCount: clips.length,
      format: "HLS",
      qualities: ["1080p", "720p", "480p", "360p"]
    }
  });

  return { jobId, outputKey, clipsCount: clips.length };
}

export async function getMediaConvertJobStatus(jobId) {
  if (!jobId) throw new Error('jobId required');
  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
  const mediaConvertClient = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint });
  const getJobCommand = new GetJobCommand({ Id: jobId });
  const jobResponse = await mediaConvertClient.send(getJobCommand);
  return jobResponse;
}
