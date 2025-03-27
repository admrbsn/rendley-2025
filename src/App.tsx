import { Engine, EventsEnum, Transition } from '@rendley/sdk';
import { useEffect, useRef, useState } from 'react';

const VIDEOS = [
  'https://player.vimeo.com/progressive_redirect/playback/932968715/rendition/720p/file.mp4?loc=external&signature=96804b58e0c6cf311e32c9338f073e064e0130fad984109edd934b551484df05',
  'https://player.vimeo.com/progressive_redirect/playback/932968538/rendition/720p/file.mp4?loc=external&signature=d0a81361234a1798fe95a3885cfd30857bc32ea08f8c90e008c9585fffb9f03f',
  'https://player.vimeo.com/progressive_redirect/playback/932968857/rendition/720p/file.mp4?loc=external&signature=39c739a4ecc4886d8e8a53b12a8f5af4758c85d5b0a54bf5d08f61d80b5fbe10'
];

const THUMBNAILS = [
  'https://place-hold.it/300x240?text=Video1',
  'https://place-hold.it/300x240?text=Video2',
  'https://place-hold.it/300x240?text=Video3'
];

const BACKGROUND_MUSIC_URL = 'https://cdn.freesound.org/previews/792/792876_10643461-lq.mp3';

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const engineRef = useRef<Engine | null>(null);
  const clipsRef = useRef<string[]>([]);
  const clipStartTimesRef = useRef<number[]>([]);

  useEffect(() => {
    audioRef.current = new Audio(BACKGROUND_MUSIC_URL);
    audioRef.current.loop = true;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    init();
    return () => {
      if (engineRef.current) {
        engineRef.current.events.removeAllListeners();
      }
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(error => {
        console.error('Error playing background music:', error);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  async function init() {
    if (!canvasRef.current) {
      return;
    }

    const engine = Engine.getInstance();
    engineRef.current = engine;

    engine.events.on(EventsEnum.PLAYING, (payload) => {
      setPlaying(payload.isPlaying);
    });

    engine.events.on(EventsEnum.READY, () => {
      setLoading(false);
    });

    // Using string event names directly instead of EventsEnum
    engine.events.on('clipChange' as any, (payload: any) => {
      if (payload && payload.clipId) {
        const clipIndex = clipsRef.current.indexOf(payload.clipId);
        if (clipIndex !== -1) {
          setCurrentVideoIndex(clipIndex);
        }
      }
    });

    engine.events.on('progress' as any, (payload: any) => {
      if (payload && typeof payload.time === 'number') {
        const currentTime = payload.time;
        
        const currentIndex = clipStartTimesRef.current.findIndex((startTime, index) => {
          const nextStartTime = clipStartTimesRef.current[index + 1] || Infinity;
          return currentTime >= startTime && currentTime < nextStartTime;
        });

        if (currentIndex !== -1 && currentIndex !== currentVideoIndex) {
          setCurrentVideoIndex(currentIndex);
        }
      }
    });

    await engine.init({
      display: {
        width: 540,
        height: 960,
        backgroundColor: '#000000',
        view: canvasRef.current,
      }
    });

    const library = engine.getLibrary();
    const uploadedVideos = await Promise.all(
      VIDEOS.map(video => library.addMedia(video))
    );

    const layer = engine.getTimeline().createLayer();
    let currentStartTime = 0;

    for (let i = 0; i < uploadedVideos.length; i++) {
      const mediaDataId = uploadedVideos[i];
      if (!mediaDataId) continue;
      
      const clip = await layer.addClip({ mediaDataId });
      if (clip) {
        const duration = await clip.getDuration();
        clipStartTimesRef.current.push(currentStartTime);
        currentStartTime += duration;
      }
    }

    clipsRef.current = layer.clipsIds;

    const timeline = engine.getTimeline();
    const display = engine.getDisplay();

    const textLayer = timeline.createLayer();

    for (let clipId of layer.clipsIds) {
      const clip = timeline.getClipById(clipId);
      if (!clip) continue;

      const mediaId = await clip.getMediaId();
      if (!mediaId) continue;
      
      const mediaData = library.getMediaById(mediaId);
      if (!mediaData) continue;

      const [displayWidth, displayHeight] = display.getResolution();
      const textPositionTop = displayHeight * 0.8;
      const textPositionLeft = displayWidth / 2;

      const duration = await clip.getDuration();
      const startTime = await clip.getStartTime();

      await textLayer.addClip({
        type: 'text',
        text: mediaData.filename || `Video ${clipId}`,
        duration,
        startTime,
        style: {
          position: [textPositionLeft, textPositionTop],
          color: '#FFFFFF',
          backgroundColor: '#000000',
          cornerRadius: [20, 20, 20, 20],
        },
      });
    }

    for (let i = 0; i < layer.clipsIds.length - 1; i++) {
      const clipId = layer.clipsIds[i];
      const transition = new Transition({
        startClipId: clipId,
        endClipId: layer.clipsIds[i + 1],
        inDuration: 1,
        outDuration: 1,
        name: 'cross_fade',
        transitionSrc: `
          vec4 transition (vec2 uv) {
            return mix(
              getFromColor(uv),
              getToColor(uv),
              progress
            );
          }
        `,
      });

      layer.addTransition(transition);
    }
  }

  function handleTogglePlay() {
    if (isPlaying) {
      Engine.getInstance().pause();
      return;
    }
    Engine.getInstance().play();
  }

  function handleThumbnailClick(index: number) {
    if (!engineRef.current || !clipsRef.current[index]) {
      return;
    }
    
    const timeline = engineRef.current.getTimeline();
    const startTime = clipStartTimesRef.current[index];
    
    timeline.seek(startTime);
    setCurrentVideoIndex(index);
    engineRef.current.play();
  }

  return (
    <div className="max-w-[540px] h-auto m-auto mt-20 flex flex-col items-center">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      <canvas ref={canvasRef} className="w-full h-auto rounded-lg shadow-lg" />

      <div className="w-full mt-4 p-4 bg-gray-800 rounded-lg">
        <div className="flex justify-center gap-4">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={handleTogglePlay}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>

        <div className="flex justify-center gap-4 mt-4">
          {THUMBNAILS.map((thumbnail, index) => (
            <div
              key={index}
              className={`relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer ${
                currentVideoIndex === index
                  ? 'ring-4 ring-blue-500 scale-105'
                  : 'opacity-50 hover:opacity-75'
              }`}
              onClick={() => handleThumbnailClick(index)}
            >
              <img
                src={thumbnail}
                alt={`Video ${index + 1}`}
                className="w-32 h-24 object-cover"
              />
              {currentVideoIndex === index && isPlaying && (
                <div className="absolute bottom-2 right-2 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;