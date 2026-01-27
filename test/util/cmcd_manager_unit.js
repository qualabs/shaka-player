/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// region CMCD Manager Setup
describe('CmcdManager Setup', () => {
  /**
   * @extends {shaka.util.FakeEventTarget}
   */
  class MockCmcdVideo extends shaka.util.FakeEventTarget {
    constructor() {
      super();
      /** @type {number} */
      this.currentTime = 0;
      /** @type {boolean} */
      this.muted = false;
    }
  }

  const createSegmentContextWithIndex = (segmentIndex) => {
    const baseContext = createSegmentContext();
    return Object.assign({}, baseContext, {
      stream: Object.assign({}, baseContext.stream, {segmentIndex}),
    });
  };

  const createSegmentContext = () => ({
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
    stream: {
      bandwidth: 8000000,
      codecs: 'avc1.42001e',
      mimeType: 'video/mp4',
      type: 'video',
      segmentIndex: 0,
    },

    segment: {startTime: 10, endTime: 12, getUris: () => ['https://test.com/v2seg.mp4']},
  });

  const createMockSegmentIndex = () => {
    const mockNextSegment = {
      getUris: () => ['https://test.com/next-seg.m4v'],
      startByte: 1000,
      endByte: 1999,
    };
    const mockIterator = {
      next: jasmine.createSpy('next')
          .and.returnValue({value: mockNextSegment, done: false}),
    };
    return {
      getIteratorForTime: jasmine.createSpy('getIteratorForTime')
          .and.returnValue(mockIterator),
    };
  };

  const createMockNextSegment = (withByteRange) => {
    const mockNextSegment = {
      getUris: () => ['https://test.com/next-seg.m4v'],
    };

    if (withByteRange) {
      mockNextSegment.startByte = 1000;
      mockNextSegment.endByte = 1999;
    }

    const mockIterator = {
      next: jasmine.createSpy('next')
          .and.returnValue({value: mockNextSegment, done: false}),
    };
    return {
      getIteratorForTime: jasmine.createSpy('getIteratorForTime')
          .and.returnValue(mockIterator),
    };
  };

  beforeEach(() => {
    const resolveScheme = jasmine.createSpy('cmcd').and.callFake(() =>
      shaka.util.AbortableOperation.completed(
          {uri: '', data: new ArrayBuffer(5), headers: {}}));

    shaka.net.NetworkingEngine.registerScheme('cmcd',
        shaka.test.Util.spyFunc(resolveScheme),
        shaka.net.NetworkingEngine.PluginPriority.FALLBACK);
  });

  /**
   * Creates a mock NetworkingEngine configured for CMCD testing.
   * This single function supports both v1 and v2 test suites.
   * @param {shaka.util.CmcdManager} cmcd
   * @return {shaka.net.NetworkingEngine}
   */
  function createNetworkingEngine(cmcd) {
    /** @type {shaka.net.NetworkingEngine} */
    const networkingEngine = new shaka.net.NetworkingEngine(
        /* onStart= */ undefined,
        /* onProgress= */ undefined,
        /* onEnd= */ undefined,
        /* onResponse= */ undefined,
        /* onRequest= */ (type, request, context) => {
          cmcd.applyRequestData(type, request, context);
        },
    );

    networkingEngine.configure(
        shaka.util.PlayerConfiguration.createDefault().networking);

    return networkingEngine;
  }

  // region CMCD V1
  describe('CmcdManager CMCD V1', () => {
    const CmcdManager = shaka.util.CmcdManager;
    const uuidRegex =
      '[A-F\\d]{8}-[A-F\\d]{4}-4[A-F\\d]{3}-[89AB][A-F\\d]{3}-[A-F\\d]{12}';
    const sidRegex = new RegExp(`sid%3D%22${uuidRegex}%22`, 'i');
    const sessionId = '2ed2d1cd-970b-48f2-bfb3-50a79e87cfa3';
    const data = {
      'sid': sessionId,
      'cid': 'xyz',
      'su': false,
      'nor': '../testing/3.m4v',
      'nrr': '0-99',
      'd': 6066.66,
      'mtp': 10049,
      'bs': true,
      'br': 52317,
      'v': 1,
      'pr': 1,
      'com.test-hello': 'world',
      'com.test-testing': 1234,
      'com.test-exists': true,
      'com.test-notExists': false,
      'com.test-token': Symbol('s'),
    };

    const mockPlayer = new shaka.util.FakeEventTarget();
    Object.assign(mockPlayer, {
      isLive: () => false,
      getLiveLatency: () => 0,
      getBandwidthEstimate: () => 10000000,
      getBufferedInfo: () => ({
        video: [
          {start: 0, end: 5},
          {start: 6, end: 31.234},
          {start: 35, end: 40},
        ],
      }),
      getNetworkingEngine: () => createNetworkingEngine(
          createCmcdManager(mockPlayer, createCmcdConfig()),
      ),
      getPlaybackRate: () => 1,
      getVariantTracks: () => /** @type {Array<shaka.extern.Track>} */ ([
        {
          type: 'variant',
          bandwidth: 50000,
          videoBandwidth: 40000,
          audioBandWidth: 10000,
        },
        {
          type: 'variant',
          bandwidth: 5000000,
          videoBandwidth: 4000000,
          audioBandWidth: 1000000,
        },
      ]),
    });

    const config = {
      enabled: true,
      sessionId,
      contentId: 'testing',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      version: 1,
    };

    function createCmcdConfig(cfg = {}) {
      return Object.assign({}, config, cfg);
    }

    function createCmcdManager(player, cfg = {}) {
      const cmcdManager = new CmcdManager(player, createCmcdConfig(cfg));
      // Mock video element for time calculations
      const video = new MockCmcdVideo();
      video.currentTime = 10;
      cmcdManager.setMediaElement(
          /** @type {!HTMLMediaElement} */ (/** @type {*} */ (video)));

      return cmcdManager;
    }

    function createRequest() {
      return {
        uris: ['https://test.com/test.mpd'],
        method: 'GET',
        body: null,
        headers: {
          testing: '1234',
        },
        allowCrossSiteCredentials: false,
        retryParameters: /** @type {shaka.extern.RetryParameters} */ ({}),
        licenseRequestType: null,
        sessionId: null,
        drmInfo: null,
        initData: null,
        initDataType: null,
        streamDataCallback: null,
      };
    }

    const request = createRequest();

    const NetworkingEngine = shaka.net.NetworkingEngine;
    const RequestType = NetworkingEngine.RequestType;

    describe('Query serialization', () => {
      it('produces correctly serialized data', () => {
        const query = CmcdManager.toQuery(data);
        const result =
          // cspell: disable
          'br=52317,bs,cid="xyz",com.test-exists,' +
          'com.test-hello="world",com.test-testing=1234,' +
          'com.test-token=s,d=6067,mtp=10000,' +
          'nor="..%2Ftesting%2F3.m4v",nrr="0-99",' +
          `sid="${sessionId}"`;
          // cspell: enable
        expect(query).toBe(result);
      });

      it('escapes reserve character in string values', () => {
        const query = CmcdManager.toQuery({
          'com.test-escape': 'Double "Quotes"',
        });
        const result = 'com.test-escape="Double \\"Quotes\\""';
        expect(query).toBe(result);
      });
    });

    describe('Header serialization', () => {
      it('produces all header shards', () => {
        const header = CmcdManager.toHeaders(data);
        expect(header).toEqual({
          'CMCD-Object': 'br=52317,d=6067',
          'CMCD-Request': 'com.test-exists,com.test-hello="world",' +
                          'com.test-testing=1234,com.test-token=s,mtp=10000,' +
                          // cspell: disable-next-line
                          'nor="..%2Ftesting%2F3.m4v",nrr="0-99"',
          'CMCD-Session': `cid="xyz",sid="${sessionId}"`,
          'CMCD-Status': 'bs',
        });
      });

      it('ignores empty shards', () => {
        expect(CmcdManager.toHeaders({br: 200})).toEqual({
          'CMCD-Object': 'br=200',
        });
      });
    });

    describe('URL to relative path', () => {
      it('produces a relative path when at root', () => {
        const from = 'http://test.com/manifest.mpd';
        const to = 'http://test.com/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('1.mp4');
      });

      it('produces a relative path when at the same folder level', () => {
        const from = 'http://test.com/base/manifest.mpd';
        const to = 'http://test.com/base/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('1.mp4');
      });

      it('produces a relative path when base is lower', () => {
        const from = 'http://test.com/manifest.mpd';
        const to = 'http://test.com/base/segments/video/1.mp4';
        const result = 'base/segments/video/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe(result);
      });

      it('produces a relative path when base is higher', () => {
        const from = 'http://test.com/base/manifest/manifest.mpd';
        const to = 'http://test.com/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('../../1.mp4');
      });

      it('produces a relative path when base and url are different', () => {
        const from = 'http://test.com/base/manifest/manifest.mpd';
        const to = 'http://test.com/base/segments/video/1.mp4';
        const result = '../segments/video/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe(result);
      });

      it('returns url when origins are different', () => {
        const from = 'http://test.com/base/manifest/manifest.mpd';
        const to = 'http://foo.com/1.mp4';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('http://foo.com/1.mp4');
      });

      it('maintains query parameters and hash in the relative path', () => {
        const from = 'http://test.com/base/manifest/manifest.mpd';
        const to = 'http://test.com/base/segments/video/1.mp4?param=foo&another=bar#hash=baz';
        const result = '../segments/video/1.mp4?param=foo&another=bar#hash=baz';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe(result);
      });

      it('produces a relative path when only query params differ', () => {
        const from = 'http://test.com/file.mp4?i=0';
        const to = 'http://test.com/file.mp4?i=1';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('file.mp4?i=1');
      });

      it('produces a relative path when only hash params differ', () => {
        const from = 'http://test.com/file.mp4#i=0';
        const to = 'http://test.com/file.mp4#i=1';
        expect(CmcdManager.urlToRelativePath(to, from)).toBe('file.mp4#i=1');
      });
    });

    describe('CmcdManager instance', () => {
      const ObjectUtils = shaka.util.ObjectUtils;

      /** @type shaka.util.CmcdManager */
      let cmcdManager = createCmcdManager(mockPlayer);

      const createContext = (type) => {
        return {
          type: type,
          stream: /** @type {shaka.extern.Stream} */ ({
            bandwidth: 5234167,
            codecs: 'avc1.42001e',
            mimeType: 'application/mp4',
            type: 'video',
          }),
          segment: /** @type {shaka.media.SegmentReference} */ ({
            startTime: 0,
            endTime: 3.33,
          }),
        };
      };

      const AdvancedRequestType = NetworkingEngine.AdvancedRequestType;
      const manifestInfo = createContext(AdvancedRequestType.MPD);
      const segmentInfo = createContext(AdvancedRequestType.MEDIA_SEGMENT);

      describe('configuration', () => {
        it('does not modify requests when disabled', () => {
          cmcdManager = createCmcdManager(
              mockPlayer,
              {
                enabled: false,
              },
          );

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0]).toBe(request.uris[0]);

          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.uris[0]).toBe(request.uris[0]);
        });

        it('generates a session id if not provided', () => {
          cmcdManager = createCmcdManager(
              mockPlayer,
              {
                sessionId: '',
              },
          );

          const r = ObjectUtils.cloneObject(request);

          cmcdManager.applyManifestData(r, manifestInfo);

          expect(sidRegex.test(r.uris[0])).toBe(true);
        });

        it('generates a session id via configure', () => {
          cmcdManager = createCmcdManager(mockPlayer);

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(true);

          const sid = 'c936730c-031e-4a73-976f-92bc34039c60';
          cmcdManager.configure(createCmcdConfig({
            sessionId: sid,
          }));
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(false);
          expect(r.uris[0].includes(sid)).toBe(true);

          cmcdManager.configure(createCmcdConfig({
            sessionId: '',
          }));
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.uris[0].includes(sessionId)).toBe(false);
          expect(r.uris[0].includes(sid)).toBe(false);
          expect(sidRegex.test(r.uris[0])).toBe(true);
        });

        it('filters keys if includeKeys is provided', () => {
          cmcdManager = createCmcdManager(
              mockPlayer,
              {
                includeKeys: ['sid', 'cid'],
              },
          );

          const r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);

          const uri = `https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2Csid%3D%22${sessionId}%22`;
          expect(r.uris[0]).toBe(uri);
        });
      });

      describe('query mode', () => {
        it('modifies all request uris', () => {
          // modifies manifest request uris
          cmcdManager = createCmcdManager(mockPlayer);

          let r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          let uri = 'https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2C' +
            'mtp%3D10000%2Cot%3Dm%2Csf%3Dd%2C' +
            `sid%3D%22${sessionId}%22%2Csu`;
          expect(r.uris[0]).toBe(uri);

          // modifies segment request uris
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          uri =
            `https://test.com/test.mpd?CMCD=bl%3D21200%2Cbr%3D5234%2Ccid%3D%22testing%22%2Cd%3D3330%2Cdl%3D21200%2Cmtp%3D10000%2Cot%3Dv%2Csf%3Dd%2Csid%3D%22${sessionId}%22%2Cst%3Dv%2Csu%2Ctb%3D4000`;
          expect(r.uris[0]).toBe(uri);

          // modifies text request uris
          r = createRequest();
          cmcdManager.applyTextData(r);
          uri =
            `https://test.com/test.mpd?CMCD=cid%3D%22testing%22%2Cmtp%3D10000%2Cot%3Dc%2Csf%3Dd%2Csid%3D%22${sessionId}%22%2Csu`;
          expect(r.uris[0]).toBe(uri);
        });
      });

      describe('header mode', () => {
        it('modifies all request headers', () => {
          cmcdManager = createCmcdManager(
              mockPlayer,
              {
                useHeaders: true,
              },
          );

          // modifies manifest request headers
          let r = createRequest();
          cmcdManager.applyManifestData(r, manifestInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'ot=m',
            'CMCD-Request': 'mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}"`,
          });

          // modifies segment request headers
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'br=5234,d=3330,ot=v,tb=4000',
            'CMCD-Request': 'bl=21200,dl=21200,mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}",st=v`,
          });

          // modifies segment request headers
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers).toEqual({
            'testing': '1234',
            'CMCD-Object': 'br=5234,d=3330,ot=v,tb=4000',
            'CMCD-Request': 'bl=21200,dl=21200,mtp=10000,su',
            'CMCD-Session': 'cid="testing",sf=d,' +
                            `sid="${sessionId}",st=v`,
          });
        });
      });

      describe('src= mode', () => {
        beforeEach(() => {
          cmcdManager = createCmcdManager(mockPlayer);
        });

        it('modifies media stream uris', () => {
          const r = cmcdManager
              .appendSrcData('https://test.com/test.mp4', 'video/mp4');
          const uri = 'https://test.com/test.mp4?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dav%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });

        it('modifies manifest stream uris', () => {
          const r = cmcdManager
              .appendSrcData('https://test.com/test.m3u8', 'application/x-mpegurl');
          const uri = 'https://test.com/test.m3u8?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dm%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });

        it('modifies text track uris', () => {
          const r = cmcdManager.appendTextTrackData('https://test.com/test.vtt');
          const uri = 'https://test.com/test.vtt?CMCD=cid%3D%22testing%22%2C' +
                      'mtp%3D10000%2Cot%3Dc%2C' +
                      `sid%3D%22${sessionId}%22%2Csu`;
          expect(r).toBe(uri);
        });
      });

      describe('adheres to the spec', () => {
        beforeEach(() => {
          cmcdManager = createCmcdManager(
              mockPlayer,
              {
                useHeaders: true,
              },
          );
          cmcdManager.setBuffering(false);
          cmcdManager.setBuffering(true);
        });

        it('sends bs only once', () => {
          let r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Status']).toContain('bs');

          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Status']).not.toContain('bs');
        });

        it('sends su until buffering is complete', () => {
          let r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).toContain(',su');

          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).toContain(',su');

          cmcdManager.setBuffering(false);
          r = createRequest();
          cmcdManager.applyRequestSegmentData(r, segmentInfo);
          expect(r.headers['CMCD-Request']).not.toContain(',su');
        });

        describe('applies core CMCD params to net engine requests', () => {
          /** @type {shaka.net.NetworkingEngine} */
          let networkingEngine;
          const uri = 'cmcd://foo';
          const retry = NetworkingEngine.defaultRetryParameters();

          beforeEach(() => {
            cmcdManager = createCmcdManager(mockPlayer);
            networkingEngine = createNetworkingEngine(cmcdManager);
          });

          it('HEAD requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            request.method = 'HEAD';
            await networkingEngine.request(RequestType.MANIFEST, request);

            const result = request.uris[0];
            expect(result).toContain('?CMCD=');
            expect(result).toContain(encodeURIComponent('sid="'));
            expect(result).toContain(encodeURIComponent('cid="testing"'));
            expect(result).not.toContain(encodeURIComponent('sf='));
          });

          it('dash manifest requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=d'));
          });

          it('hls manifest requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MASTER_PLAYLIST});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=h'));
          });

          it('hls playlist requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MEDIA_PLAYLIST});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=m'));
            expect(result).toContain(encodeURIComponent('sf=h'));
          });

          it('init segment requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.SEGMENT, request,
                {type: AdvancedRequestType.INIT_SEGMENT});

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=i'));
          });

          it('media segment requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(
                RequestType.SEGMENT,
                request,
                manifestInfo,
            );

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=v'));
          });

          it('key requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.KEY, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('license requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.LICENSE, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('cert requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.SERVER_CERTIFICATE,
                request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=k'));
          });

          it('timing requests', async () => {
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.TIMING, request);

            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('ot=o'));
          });

          it('not when enabled is false', async () => {
            cmcdManager = createCmcdManager(
                mockPlayer,
                {
                  enabled: false,
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.TIMING, request);

            const result = request.uris[0];
            expect(result).not.toContain('?CMCD=');
          });

          it('returns cmcd v2 data in query if version is 2', async () => {
            const livePlayer = new shaka.util.FakeEventTarget();
            Object.assign(livePlayer, mockPlayer, {
              isLive: () => true,
              getLiveLatency: () => 3100,
            });
            cmcdManager = createCmcdManager(
                livePlayer,
                {
                  version: 2,
                  includeKeys: ['ltc', 'msd', 'v'],
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            // Trigger Play and Playing events
            cmcdManager.onPlaybackPlay_();
            cmcdManager.onPlaybackPlaying_();
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});
            const result = request.uris[0];
            expect(result).toContain(encodeURIComponent('v=2'));
            expect(result).toContain(encodeURIComponent('ltc'));
            expect(result).toContain(encodeURIComponent('msd'));
          });

          it('doesn\'t return cmcd v2 data in query if version is not 2',
              async () => {
                const livePlayer = new shaka.util.FakeEventTarget();
                Object.assign(livePlayer, mockPlayer, {
                  isLive: () => true,
                  getLiveLatency: () => 3100,
                });

                const cmcdManagerTmp = createCmcdManager(
                    livePlayer,
                    {
                      version: 1,
                      includeKeys: ['ltc', 'msd'],
                    },
                );
                networkingEngine = createNetworkingEngine(cmcdManagerTmp);

                // Trigger Play and Playing events
                cmcdManagerTmp.onPlaybackPlay_();
                cmcdManagerTmp.onPlaybackPlaying_();

                const request = NetworkingEngine.makeRequest([uri], retry);
                await networkingEngine.request(RequestType.MANIFEST, request,
                    {type: AdvancedRequestType.MPD});
                const result = request.uris[0];
                expect(result).not.toContain(encodeURIComponent('ltc'));
                expect(result).not.toContain(encodeURIComponent('msd'));
              });

          it('returns cmcd v2 data in header if version is 2', async () => {
            const livePlayer = new shaka.util.FakeEventTarget();
            Object.assign(livePlayer, mockPlayer, {
              isLive: () => true,
              getLiveLatency: () => 3100,
            });
            cmcdManager = createCmcdManager(
                livePlayer,
                {
                  version: 2,
                  includeKeys: ['ltc', 'msd'],
                  useHeaders: true,
                },
            );
            networkingEngine = createNetworkingEngine(cmcdManager);

            // Trigger Play and Playing events
            cmcdManager.onPlaybackPlay_();
            cmcdManager.onPlaybackPlaying_();
            const request = NetworkingEngine.makeRequest([uri], retry);
            await networkingEngine.request(RequestType.MANIFEST, request,
                {type: AdvancedRequestType.MPD});
            expect(request.headers['CMCD-Request']).toContain('ltc');
            expect(request.headers['CMCD-Session']).toContain('msd');
          });

          it('doesn\'t return cmcd v2 data in headers if version is not 2',
              async () => {
                const livePlayer = new shaka.util.FakeEventTarget();
                Object.assign(livePlayer, mockPlayer, {
                  isLive: () => true,
                  getLiveLatency: () => 3100,
                });
                cmcdManager = createCmcdManager(
                    livePlayer,
                    {
                      version: 1,
                      includeKeys: ['ltc', 'msd'],
                      useHeaders: true,
                    },
                );
                networkingEngine = createNetworkingEngine(cmcdManager);
                cmcdManager.onPlaybackPlay_();
                cmcdManager.onPlaybackPlaying_();
                const request = NetworkingEngine.makeRequest([uri], retry);
                await networkingEngine.request(RequestType.MANIFEST, request,
                    {type: AdvancedRequestType.MPD});
                expect(request.headers['CMCD-Request']).not.toContain('ltc');
                expect(request.headers['CMCD-Session']).not.toContain('msd');
              },
          );

          it('generates `nrr` for CMCD V1 segment requests', () => {
            cmcdManager = createCmcdManager(
                mockPlayer,
                {
                  version: 1,
                  includeKeys: ['ltc', 'msd', 'nrr'],
                  useHeaders: false,
                },
            );

            const request = createRequest();
            const context = createSegmentContextWithIndex(
                createMockSegmentIndex(),
            );

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nrr="1000-1999"');
          });

          it('generates `nor` for URL-based segment requests', () => {
            const cmcdManager = createCmcdManager(
                mockPlayer,
            );
            const request = createRequest();

            const context =
                createSegmentContextWithIndex(createMockNextSegment(false));

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nor="next-seg.m4v"');
            expect(decodedUri).not.toContain('nrr=');
          });

          it('generates `nrr` for byte-range segment requests', () => {
            const cmcdManager = createCmcdManager(
                mockPlayer,
            );
            const request = createRequest();
            // Create a context where the next segment HAS a byte range
            const context =
                createSegmentContextWithIndex(createMockNextSegment(true));

            cmcdManager.applyRequestSegmentData(request, context);
            const decodedUri = decodeURIComponent(request.uris[0]);

            expect(decodedUri).toContain('nrr="1000-1999"');
            expect(decodedUri).toContain('nor=');
          });
        });
      });
    });
  });

  // region CMCD V2
  describe('CmcdManager CMCD v2', () => {
    const CmcdManager = shaka.util.CmcdManager;
    const sessionId = 'e98d4f72-cc6d-4c60-96a2-44c7bfc2ddee';

    // Mock data and interfaces
    const mockPlayerData = {
      'v': 2,
      'sid': sessionId,
      'cid': 'xyz',
      'su': false,
      'nor': '../testing/3.m4v',
      'nrr': '0-99',
      'd': 6066.66,
      'mtp': 10049,
      'bs': true,
      'br': 52317,
      'pr': 1.5,
      'msd': 700,
      'ltc': 3100,
      'ab': 3500,
      'bl': 4500,
      'tbl': 6000,
      'dl': 8000,
      'rtp': 30000,
      'com.test-hello': 'world',
      'com.test-testing': 1234,
      'com.test-exists': true,
      'com.test-notExists': false,
      'com.test-token': Symbol('s'),
    };

    const mockPlayer = new shaka.util.FakeEventTarget();
    Object.assign(mockPlayer, {
      isLive: () => true,
      getLiveLatency: () => 3100,
      getBandwidthEstimate: () => 10000000,
      getNetworkingEngine: () => createNetworkingEngine(
          createCmcdManager(mockPlayer, createCmcdConfig()),
      ),
      getBufferedInfo: () => ({
        video: [
          {start: 0, end: 15},
          {start: 6, end: 31.234},
          {start: 35, end: 40},
        ],
      }),
      getPlaybackRate: () => 1.25,
      getVariantTracks: () => [
        {
          type: 'variant',
          bandwidth: 50000,
          videoBandwidth: 40000,
          audioBandwidth: 10000,
        },
        {
          type: 'variant',
          bandwidth: 5000000,
          videoBandwidth: 4000000,
          audioBandwidth: 1000000,
        },
      ],
    });

    const baseConfig = {
      enabled: true,
      sessionId,
      contentId: 'v2content',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      version: 2,
      targets: [{
        enabled: true,
        url: 'https://example.com/cmcd-collector',
        events: ['rr'],
      }],
    };

    const createCmcdConfig = (cfg = {}) => Object.assign({}, baseConfig, cfg);
    const createCmcdManager = (player, cfg = {}) => {
      const cmcdManager = new CmcdManager(player, createCmcdConfig(cfg));
      // Mock video element for time calculations
      const video = new MockCmcdVideo();
      video.currentTime = 5;
      cmcdManager.setMediaElement(
          /** @type {!HTMLMediaElement} */ (/** @type {*} */ (video)));

      return cmcdManager;
    };

    const createRequest = () => ({
      uris: ['https://test.com/v2test.mpd'],
      method: 'GET',
      body: null,
      headers: {testing: '1234'},
      allowCrossSiteCredentials: false,
      retryParameters: {},
    });

    const createResponse = () => ({
      uri: 'https://test.com/v2seg.mp4',
      headers: {},
      data: new ArrayBuffer(8),
      status: 200,
    });

    const createResponseWithRealTiming = () => ({
      uri: 'https://test.com/v2seg.mp4',
      headers: {},
      data: new ArrayBuffer(8),
      timeMs: 400, // This is the TTLB
      originalRequest: {
        timeToFirstByte: 150, // This is the TTFB
      },
    });

    describe('Serialization', () => {
      it('serializes data to a query string', () => {
        const query = CmcdManager.toQuery({v: 2, msd: 250});
        expect(query).toContain('v=2');
        expect(query).toContain('msd=250');
      });

      it('serializes data to headers', () => {
        const headers = CmcdManager.toHeaders(mockPlayerData);
        expect(headers['CMCD-Session']).toContain(`sid="${sessionId}"`);
        expect(headers['CMCD-Session']).toContain('v=2');
      });
    });

    describe('Configuration and Mode Handling', () => {
      it('filters CMCD response keys correctly', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['rc', 'url'],
                events: ['rr'],
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();
        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const body = shaka.util.StringUtils.fromUTF8(request.body);
        const parts = body.split(',');

        // Check that allowed keys are present
        expect(parts.some((p) => p.startsWith('rc='))).toBe(true);
        expect(parts.some((p) => p.startsWith('url='))).toBe(true);
      });

      it('applies CMCD data to request URL in query mode', () => {
        const cmcdManager = createCmcdManager(mockPlayer);
        const request = createRequest();
        cmcdManager.applyManifestData(request, {});

        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('CMCD=');
        expect(decodedUri).toContain('v=2');
      });

      it('applies CMCD data to request headers in header mode', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {useHeaders: true},
        );

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        expect(request.headers['CMCD-Session']).toContain(`sid="${sessionId}"`);
        expect(request.headers['CMCD-Session']).toContain('v=2');
      });

      it('includes response code in body', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['rc'],
                events: ['rr'],
              }],
            },
        );

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const body = shaka.util.StringUtils.fromUTF8(request.body);
        const parts = body.split(',');

        // Check that includes rc=200
        expect(parts.some((p) => p.startsWith('rc=200'))).toBe(true);
      });

      it('does not include response code if not provided', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['rc', 'v'],
                events: ['rr'],
              }],
            },
        );

        const response = {
          uri: 'https://test.com/v2seg.mp4',
          headers: {},
          data: new ArrayBuffer(8),
        };

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const body = shaka.util.StringUtils.fromUTF8(request.body);
        const parts = body.split(',');

        // Expect v=2 and rc=0
        expect(parts.some((p) => p.startsWith('v=2'))).toBe(true);
        expect(parts.some((p) => p.startsWith('rc=0'))).toBe(true);
      });

      it('applies v2 keys to response body in response', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd-collector',
                includeKeys: ['sid', 'cid', 'msd', 'ltc', 'v'],
                events: ['rr'],
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();
        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const body = shaka.util.StringUtils.fromUTF8(request.body);
        const parts = body.split(",");

        // Expect to contain sid, cid, msd, ltc and v
        expect(parts.some((p) => p.startsWith('sid='))).toBe(true);
        expect(parts.some((p) => p.startsWith('cid='))).toBe(true);
        expect(parts.some((p) => p.startsWith('msd='))).toBe(true);
        expect(parts.some((p) => p.startsWith('ltc='))).toBe(true);
        expect(parts.some((p) => p.startsWith('v=2'))).toBe(true);

        // Expect to not contain br and mtp
        expect(parts.some((p) => p.startsWith('br='))).toBe(false);
        expect(parts.some((p) => p.startsWith('mtp='))).toBe(false);
      });

      it('filters keys in response based on includeKeys', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd-collector',
                includeKeys: ['sid', 'msd'],
                events: ['rr'],
              }],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const body = shaka.util.StringUtils.fromUTF8(request.body);
        const parts = body.split(",");

        expect(parts.some((p) => p.startsWith('sid='))).toBe(true);
        expect(parts.some((p) => p.startsWith('msd='))).toBe(true);
        expect(parts.some((p) => p.startsWith('v=2'))).toBe(false);

      });

      it('filters keys in request mode based on includeKeys', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              includeKeys: ['sid', 'msd'],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const request = createRequest();
        cmcdManager.applyRequestData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            request,
            createSegmentContext(),
        );

        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('sid=');
        expect(decodedUri).toContain('msd=');
        expect(decodedUri).not.toContain('v=2');
      });
    });

    describe('CMCD v2 Key Generation', () => {
      it('sn increments sequence number for each request', () => {
        const cmcdManager = createCmcdManager(mockPlayer, {
          includeKeys: ['sn'],
        });
        const request1 = createRequest();
        cmcdManager.applyManifestData(request1, {});
        expect(decodeURIComponent(request1.uris[0])).toContain('sn=1');

        const request2 = createRequest();
        cmcdManager.applyManifestData(request2, {});
        expect(decodeURIComponent(request2.uris[0])).toContain('sn=2');
      });

      it('sn increments sequence number for each response', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd-collector',
                includeKeys: ['sn'],
                events: ['rr'],
              }],
            },
        );

        const response1 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response1,
            createSegmentContext(),
        );

        // Verify first request was made
        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request1 = requestSpy.calls.argsFor(0)[1];
        const body1Parts = shaka.util.StringUtils.fromUTF8(request1.body).split(',');
        expect(body1Parts.some((p) => p.startsWith('sn=1'))).toBe(true);

        const response2 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response2,
            createSegmentContext(),
        );

        // Verify second request was made
        expect(requestSpy).toHaveBeenCalledTimes(2);
        const request2 = requestSpy.calls.argsFor(1)[1];
        const request2Parts = shaka.util.StringUtils.fromUTF8(request2.body).split(',');
        expect(request2Parts.some((p) => p.startsWith('sn=2'))).toBe(true);
      });

      it('sn increments sequence numbers across multiple targets', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [
                {
                  enabled: true,
                  url: 'https://a.collector.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'],
                },
                {
                  enabled: true,
                  url: 'https://b.collector.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'],
                },
              ],
            },
        );
        const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            createResponse(),
            createSegmentContext(),
        );

        expect(spy).toHaveBeenCalledTimes(2);

        const firstCallForTargetA = spy.calls.all()
            .find((call) => call.args[1].url === 'https://a.collector.com/cmcd');
        const firstCallForTargetB = spy.calls.all()
            .find((call) => call.args[1].url === 'https://b.collector.com/cmcd');

        expect(firstCallForTargetA.args[0].sn).toBe(1);
        expect(firstCallForTargetB.args[0].sn).toBe(1);

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            createResponse(),
            createSegmentContext(),
        );

        expect(spy).toHaveBeenCalledTimes(4);

        // Collect all calls for each target.
        const allCallsForTargetA = spy.calls.all()
            .filter((call) => call.args[1].url === 'https://a.collector.com/cmcd');
        const allCallsForTargetB = spy.calls.all()
            .filter((call) => call.args[1].url === 'https://b.collector.com/cmcd');

        expect(allCallsForTargetA.length).toBe(2);
        expect(allCallsForTargetB.length).toBe(2);

        expect(allCallsForTargetA[0].args[0].sn).toBe(1);
        expect(allCallsForTargetA[1].args[0].sn).toBe(2);

        expect(allCallsForTargetB[0].args[0].sn).toBe(1);
        expect(allCallsForTargetB[1].args[0].sn).toBe(2);
      });

      it('sn ignores disabled response targets', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              enabled: true,
              targets: [
                {
                  enabled: true,
                  url: 'https://enabled.collector.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'],
                },
                {
                  enabled: false,
                  url: 'https://disabled.collector.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'],
                },
              ],
            },
        );
        const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            createResponse(),
            createSegmentContext(),
        );

        expect(spy).toHaveBeenCalledTimes(1);
        const calledTarget = spy.calls.first().args[1];
        expect(calledTarget.url).toBe('https://enabled.collector.com/cmcd');
      });

      it('skips applyResponseSegmentData when targets are disabled', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [
                {
                  enabled: false,
                  url: 'https://disabled.collector.com/cmcd',
                  events: ['rr'],
                },
              ],
            },
        );
        const spy = spyOn(cmcdManager, 'applyResponseSegmentData')
            .and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            createResponse(),
            createSegmentContext(),
        );

        expect(spy).not.toHaveBeenCalled();
      });

      it('includes ltc for live content request mode', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              includeKeys: ['ltc'],
            },
        );

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        expect(decodeURIComponent(request.uris[0])).toContain('ltc=');
      });

      it('includes ltc for live content response', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['sid', 'msd', 'ltc'],
                events: ['rr'],
              }],
            },
        );

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");

        expect(bodyParts.some((p) => p.startsWith('ltc='))).toBe(true);
      });

      it('sends `msd` only on the first request', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const request1 = createRequest();
        cmcdManager.applyManifestData(request1, {});
        expect(decodeURIComponent(request1.uris[0])).toContain('msd=');

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const request2 = createRequest();
        cmcdManager.applyManifestData(request2, {});
        expect(decodeURIComponent(request2.uris[0])).not.toContain('msd=');
      });

      it('sends msd only on the first response', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response1 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response1,
            createSegmentContext(),
        );

        // Verify that first CMCD request was made and contains msd
        expect(requestSpy).toHaveBeenCalled();
        const request1 = requestSpy.calls.mostRecent().args[1];

        const bodyParts1 = shaka.util.StringUtils.fromUTF8(request1.body).split(",");
        expect(bodyParts1.some((p) => p.startsWith('msd='))).toBe(true);

        // Reset the spy for the second request
        requestSpy.calls.reset();

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response2 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response2,
            createSegmentContext(),
        );

        // Verify that second CMCD request was made but does not contain msd
        expect(requestSpy).toHaveBeenCalled();
        const request2 = requestSpy.calls.mostRecent().args[1];
        const bodyParts2 = shaka.util.StringUtils.fromUTF8(request2.body).split(",");
        expect(bodyParts2.some((p) => p.startsWith('msd='))).toBe(false);
      });

      it('should generate "sf" for manifest requests', () => {
        const cmcdManager = createCmcdManager(mockPlayer);
        const r = createRequest();

        const context = {
          type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
        };

        cmcdManager.applyManifestData(r, context);
        const decoded = decodeURIComponent(r.uris[0]);

        expect(decoded).toContain('sf=d');
      });

      it('should generate sf for segment responses', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sf'],
              })],
            },
        );

        const manifestContext = {
          type: shaka.net.NetworkingEngine.AdvancedRequestType.MPD,
        };

        cmcdManager.applyManifestData(createRequest(), manifestContext);

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('sf=d'))).toBe(true);
      });

      it('should generate "bs" after a rebuffering event request', () => {
        const cmcdManager = createCmcdManager(mockPlayer);
        const context = createSegmentContextWithIndex(createMockSegmentIndex());

        cmcdManager.setBuffering(false);
        cmcdManager.setBuffering(true);

        const r1 = createRequest();
        cmcdManager.applyRequestSegmentData(r1, context);
        const decoded1 = decodeURIComponent(r1.uris[0]);

        expect(decoded1).toContain('bs');

        const r2 = createRequest();
        cmcdManager.applyRequestSegmentData(r2, context);
        const decoded2 = decodeURIComponent(r2.uris[0]);

        expect(decoded2).not.toContain('bs');
      });

      it('should generate bs after a rebuffering event response', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['bs', 'ot'],
              })],
            },
        );
        const context = createSegmentContext();
        const response = createResponse();

        cmcdManager.setBuffering(false);
        cmcdManager.setBuffering(true);

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );

        // Verify that first CMCD request was made and contains bs
        expect(requestSpy).toHaveBeenCalled();
        const request1 = requestSpy.calls.mostRecent().args[1];
        const body1Parts = shaka.util.StringUtils.fromUTF8(request1.body).split(",");
        expect(body1Parts.some((p) => p.startsWith('bs'))).toBe(true);

        // Reset the spy for the second request
        requestSpy.calls.reset();

        const response2 = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response2,
            context,
        );

        // Verify that second CMCD request was made but does not contain bs
        expect(requestSpy).toHaveBeenCalled();
        const request2 = requestSpy.calls.mostRecent().args[1];
        const body2Parts = shaka.util.StringUtils.fromUTF8(request2.body).split(",");
        expect(body2Parts.some((p) => p.startsWith('bs'))).toBe(false);
      });

      it('generates `rtp` for segment requests', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp'],
              })],
            },
        );

        const request = createRequest();
        const context = createSegmentContextWithIndex(createMockSegmentIndex());
        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('rtp=');
      });

      it('request excludes `nrr` key for v2, even if requested', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              includeKeys: ['nrr', 'rtp'],
            },
        );
        const request = createRequest();
        const context = createSegmentContextWithIndex(createMockSegmentIndex());

        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).not.toContain('nrr=');
        expect(decodedUri).toContain('rtp=');
      });


      it('generates `rtp` for segment responses', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp', 'nor'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContextWithIndex(createMockSegmentIndex()),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");

        expect(bodyParts.some((p) => p.startsWith('rtp='))).toBe(true);  
      });

      it('sends ttfb and ttlb query', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['ttfb', 'ttlb'],
                events: ['rr'],
              }],
            },
        );

        const response = createResponseWithRealTiming();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('ttfb=150'))).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('ttlb=400'))).toBe(true);
      });

      it('does not generate ttfb or ttlb if timing info is missing', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['ttfb', 'ttlb'],
                useHeaders: false,
                events: ['rr'],
              }],
            },
        );

        const response = createResponse();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).not.toContain('ttfb');
        expect(decodedUri).not.toContain('ttlb');
      });

      it('generates nor for URL-based segment responses', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE);
        const response = createResponse();
        const context =
            createSegmentContextWithIndex(createMockNextSegment(false));

        cmcdManager.applyResponseSegmentData(response, context);

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('nor="next-seg.m4v"'))).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('nrr='))).toBe(false);
      });

      it('includes the request URL, without CMCD in event mode', () => {
        // toContain is not working properly on Tizen 3.
        if (deviceDetected.getDeviceName() === 'Tizen') {
          pending('Disabled on Tizen.');
        }

        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              version: 2,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['url'],
                events: ['rr'],
              }],
            },
        );

        const response = createResponse();
        response.uri = 'https://redirected.com/v2seg.mp4';
        response.originalUri = 'https://initial.com/v2seg.mp4?CMCD=br%3D5234%2Cot%3Dv';

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];

        const expectedCleanUrl = 'https://initial.com/v2seg.mp4';
        const expectedUrlParam = `url="${expectedCleanUrl}"`;
        const unexpectedUrlParam = `url="${response.originalUri}"`;

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");

        expect(bodyParts.some((p) => p === expectedUrlParam)).toBe(true);
        expect(bodyParts.some((p) => p === unexpectedUrlParam)).toBe(false);

      });

      it('cmcd url key preserves other query parameters', () => {
        // toContain is not working properly on Tizen 3.
        if (deviceDetected.getDeviceName() === 'Tizen') {
          pending('Disabled on Tizen.');
        }

        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['url'],
            events: ['rr'],
          }]},
        );

        const response = createResponse();
        response.uri = 'https://redirected.com/v2seg.mp4';

        response.originalUri = 'https://initial.com/v2seg.mp4?foo=bar&CMCD=br%3D5234&baz=qux';

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const decodedUri = decodeURIComponent(request.uris[0]);

        const expectedCleanUrl = 'https://initial.com/v2seg.mp4?foo=bar&baz=qux';
        const expectedUrlParam = `url="${expectedCleanUrl}"`;

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === expectedUrlParam)).toBe(true);
      });

      it('cmcd url key does not modify URL if no CMCD param is present', () => {
        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['url'],
            events: ['rr'],
          }]},
        );

        const response = createResponse();
        const originalUrl = 'https://initial.com/v2seg.mp4?foo=bar';
        response.uri = 'https://redirected.com/v2seg.mp4';
        response.originalUri = originalUrl;

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const expectedUrlParam = `url="${originalUrl}"`;

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === expectedUrlParam)).toBe(true);
      });

      it('cmcd url key preserves URL fragments (hash)', () => {
        // toContain is not working properly on Tizen 3.
        if (deviceDetected.getDeviceName() === 'Tizen') {
          pending('Disabled on Tizen.');
        }

        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['url'],
            events: ['rr'],
          }]},
        );

        const response = createResponse();
        response.uri = 'https://redirected.com/v2seg.mp4';
        response.originalUri = 'https://initial.com/v2seg.mp4?CMCD=br%3D5234#t=10';

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];

        const expectedCleanUrl = 'https://initial.com/v2seg.mp4#t=10';
        const expectedUrlParam = `url="${expectedCleanUrl}"`;

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === expectedUrlParam)).toBe(true);
      });

      it('cmcd url key handles an empty CMCD parameter', () => {
        // toContain is not working properly on Tizen 3.
        if (deviceDetected.getDeviceName() === 'Tizen') {
          pending('Disabled on Tizen.');
        }

        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['url'],
            useHeaders: false,
            events: ['rr'],
          }]},
        );

        const response = createResponse();
        response.uri = 'https://redirected.com/v2seg.mp4';
        response.originalUri = 'https://initial.com/v2seg.mp4?CMCD=';

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const expectedCleanUrl = 'https://initial.com/v2seg.mp4';
        const expectedUrlParam = `url="${expectedCleanUrl}"`;

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === expectedUrlParam)).toBe(true);
      });

      it('should generate "cmsdd" from response header', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['cmsdd'],
              })],
            },
        );

        const response = createResponse();
        const cmsddData = `
          "CDNB-3ak1";
          etp=96;
          rtt=8,"CDNB-w35k";
          etp=76;
          rtt=32,"CDNA987.343";
          etp=48;
          rtt=30,"CDNA-312.663";
          etp=115;rtt=16;
          mb=5000'`;

        response.headers['CMSD-Dynamic'] = cmsddData;

        const encodedCmsddData = btoa(cmsddData);

        const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        expect(spy).toHaveBeenCalled();
        const sentCmcdData = spy.calls.argsFor(0)[0];
        expect(sentCmcdData.cmsdd.toString())
            .toBe(encodedCmsddData.toString());
      });

      it('cmsdd value should be Base64 encoded', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['cmsdd'],
              })],
            },
        );

        const response = createResponse();
        const cmsddData = `
          "CDNB-3ak1";
          etp=96;
          rtt=8,"CDNB-w35k";
          etp=76;
          rtt=32,"CDNA987.343";
          etp=48;
          rtt=30,"CDNA-312.663";
          etp=115;rtt=16;
          mb=5000'`;

        response.headers['CMSD-Dynamic'] = cmsddData;
        const encodedCmsddData = btoa(cmsddData);

        const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext(),
        );

        expect(spy).toHaveBeenCalled();
        const sentCmcdData = spy.calls.argsFor(0)[0];
        expect(sentCmcdData.cmsdd.toString())
            .toBe(encodedCmsddData.toString());
      });

      
      it('should not include cmsdd if header is not present', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['cmsdd'],
              })],
            },
        );

        const response = createResponse();

        const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContext());

        const sentCmcdData = spy.calls.argsFor(0)[0];
        expect(sentCmcdData.cmsdd).toBeUndefined();
      });

      it('response excludes nrr key for v2, even if requested', () => {
        // Set up spy for CMCD requests in event mode
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [Object.assign({}, baseConfig.targets[0], {
                includeKeys: ['sid', 'msd', 'rtp', 'nor', 'nrr'],
              })],
            },
        );

        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        const response = createResponse();

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            createSegmentContextWithIndex(createMockSegmentIndex()),
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('rtp='))).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('nrr='))).toBe(false);        
      });


      it('includes bg in request query when page is hidden', () => {
        Object.defineProperty(document, 'hidden',
            {value: true, configurable: true});

        const cmcdManager = createCmcdManager(mockPlayer,
            {useHeaders: false});

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        const decodedUri = decodeURIComponent(request.uris[0]);
        const cmcdQuery = decodedUri.split('CMCD=')[1];
        expect(`,${cmcdQuery},`).toContain(',bg,');
      });

      it('includes bg in request headers when page is hidden', () => {
        Object.defineProperty(document, 'hidden',
            {value: true, configurable: true});

        const cmcdManager = createCmcdManager(mockPlayer,
            {useHeaders: true});

        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        expect(request.headers['CMCD-Status']).toContain('bg');
      });

      it('does not include bg in request mode when page is visible', () => {
        Object.defineProperty(document, 'hidden',
            {value: false, configurable: true});

        const cmcdManager = createCmcdManager(mockPlayer,
            {useHeaders: true});


        const request = createRequest();
        cmcdManager.applyManifestData(request, {});
        if (request.headers['CMCD-Status']) {
          expect(request.headers['CMCD-Status']).not.toContain('bg');
        } else {
          expect(request.headers['CMCD-Status']).toBeUndefined();
        }
      });


      it('assigns bg to the CMCD-Status header in request mode', () => {
        Object.defineProperty(document, 'hidden',
            {value: true, configurable: true});

        const cmcdManager = createCmcdManager(mockPlayer,
            {useHeaders: true});

        const request = createRequest();
        cmcdManager.applyRequestSegmentData(request, createSegmentContext());
        expect(request.headers['CMCD-Status']).toBeDefined();
        expect(request.headers['CMCD-Status']).toContain('bg');
      });

      it('request does not include v2 keys if version is not 2', () => {
        const nonV2Manager = createCmcdManager(
            mockPlayer,
            {version: 1, includeKeys: ['msd', 'ltc']},
        );
        const request = createRequest();
        nonV2Manager.applyManifestData(request, {});
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).not.toContain('msd=');
        expect(decodedUri).not.toContain('ltc=');
      });

      it('includes ts for segment requests', () => {
        const cmcdManager = createCmcdManager(mockPlayer, {version: 2});
        const request = createRequest();
        const context = createSegmentContext();
        cmcdManager.applyRequestSegmentData(request, context);
        const decodedUri = decodeURIComponent(request.uris[0]);
        expect(decodedUri).toContain('ts=');
      });

      it('includes ts for segment responses', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['ts'],
            events: ['rr'],
          }],
        });
        const response = createResponse();
        const context = createSegmentContext();
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const request = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);
      });

      it('reuses request timestamp for event mode', () => {
        const requestSpy = jasmine.createSpy('request');
        const networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        const mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(mockPlayerWithNE, {
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['ts'],
            events: ['rr'],
          }],
        });

        const request = createRequest();
        const response = createResponse();
        const context = createSegmentContext();

        response.originalRequest = request;

        let fakeTimestamp = 1234567890000;
        spyOn(Date, 'now').and.callFake(() => fakeTimestamp);

        cmcdManager.applyRequestSegmentData(request, context);

        fakeTimestamp = 9876543210000;
        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );

        // Verify that a CMCD request was made
        expect(requestSpy).toHaveBeenCalled();
        const cmcdRequest = requestSpy.calls.mostRecent().args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(cmcdRequest.body).split(",");
        expect(bodyParts.some((p) => p === 'ts=1234567890000')).toBe(true);
        expect(bodyParts.some((p) => p === 'ts=9876543210000')).toBe(false);
      });

      it('sends the same timestamp to multiple event mode targets', () => {
        const networkingEngine = createNetworkingEngine(null);
        const networkingEngineSpy = spyOn(networkingEngine, 'request')
            .and.callFake(
                () => shaka.util.AbortableOperation.completed(
                    {uri: '', data: new ArrayBuffer(5), headers: {}}),
            );

        const playerWithSpy = new shaka.util.FakeEventTarget();
        Object.assign(playerWithSpy, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(
            playerWithSpy,
            {
              version: 2,
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd-event-1',
                includeKeys: ['ts'],
                events: ['rr'],
              }, {
                enabled: true,
                url: 'https://example.com/cmcd-event-2',
                includeKeys: ['ts'],
                events: ['rr'],
              }],
            },
        );

        const request = createRequest();
        const response = createResponse();
        const context = createSegmentContext();

        response.originalRequest = request;

        let fakeTimestamp = 1234567890000;
        spyOn(Date, 'now').and.callFake(() => fakeTimestamp);

        cmcdManager.applyRequestSegmentData(request, context);

        fakeTimestamp = 9876543210000;

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );
        expect(networkingEngineSpy).toHaveBeenCalledTimes(2);

        const target1Call = networkingEngineSpy.calls.all().find((call) =>
          call.args[1].uris[0].startsWith('https://example.com/cmcd-event-1'));

        const target2Call = networkingEngineSpy.calls.all().find((call) =>
          call.args[1].uris[0].startsWith('https://example.com/cmcd-event-2'));

        expect(target1Call).withContext(
            'Query target call not found').toBeDefined();
        expect(target2Call).withContext(
            'Header target call not found').toBeDefined();

        const target1Request = target1Call.args[1];
        const target1BodyParts = shaka.util.StringUtils.fromUTF8(target1Request.body).split(',');
        expect(target1BodyParts.some((p) => p === 'ts=1234567890000')).toBe(true);
        expect(target1BodyParts.some((p) => p === 'ts=9876543210000')).toBe(false);

        const target2Request = target2Call.args[1];
        const target2BodyParts = shaka.util.StringUtils.fromUTF8(target2Request.body).split(',');
        expect(target2BodyParts.some((p) => p === 'ts=1234567890000')).toBe(true);
        expect(target2BodyParts.some((p) => p === 'ts=9876543210000')).toBe(false);
      });

      it('includes timestamp in event mode when request is disabled', () => {
        const networkingEngine = createNetworkingEngine(null);
        const networkingEngineSpy = spyOn(networkingEngine, 'request')
            .and.callFake(
                () => shaka.util.AbortableOperation.completed(
                    {uri: '', data: new ArrayBuffer(5), headers: {}}));

        const playerWithSpy = new shaka.util.FakeEventTarget();
        Object.assign(playerWithSpy, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });

        const cmcdManager = createCmcdManager(playerWithSpy, {
          enabled: false,
          version: 2,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd-query',
            includeKeys: ['ts'],
            events: ['rr'],
          }],
        });

        const request = createRequest();
        const response = createResponse();
        const context = createSegmentContext();

        cmcdManager.applyRequestSegmentData(request, context);
        expect(request.uris[0]).toBe('https://test.com/v2test.mpd');

        const fakeTimestamp = 1234567890000;
        spyOn(Date, 'now').and.callFake(() => fakeTimestamp);

        cmcdManager.applyResponseData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            response,
            context,
        );

        expect(networkingEngineSpy).toHaveBeenCalledTimes(1);

        const queryTargetCall = networkingEngineSpy.calls.first();
        const queryRequest = queryTargetCall.args[1];
        const bodyParts = shaka.util.StringUtils.fromUTF8(queryRequest.body).split(',');
        expect(bodyParts.some((p) => p === 'ts=1234567890000')).toBe(true);
      });

      it('response does not include v2 keys if version is not 2', () => {
        const nonV2Manager = createCmcdManager(
            mockPlayer,
            {version: 1, includeKeys: ['msd', 'ltc']},
        );
        const response = createResponse();
        nonV2Manager.applyResponseData(response, {});

        const decodedUri = decodeURIComponent(response.uri);
        expect(decodedUri).not.toContain('msd=');
        expect(decodedUri).not.toContain('ltc=');
      });

      it('cmcd does not include the url parameter for CMCD v1', () => {
        const cmcdManager = createCmcdManager(
            mockPlayer, {
              // Only set version to 1, use default targets (no events)
              version: 1,
            },
        );

        const request = createRequest();
        request.uris = ['https://initial.com/v2seg.mp4'];

        cmcdManager.applyRequestData(
            shaka.net.NetworkingEngine.RequestType.SEGMENT,
            request,
            createSegmentContext(),
        );

        const decodedUri = decodeURIComponent(request.uris[0]);

        expect(decodedUri).not.toContain('url=');
      });
    });

    it('should generate cmsds from response header', () => {
      const cmcdManager = createCmcdManager(
          mockPlayer,
          {
            targets: [Object.assign({}, baseConfig.targets[0], {
              includeKeys: ['cmsds'],
            })],
          },
      );

      const response = createResponse();
      const cmsdsData = `ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"`;

      response.headers['CMSD-Static'] = cmsdsData;

      const encodedCmsdsData = btoa(cmsdsData);

      const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

      cmcdManager.applyResponseData(
          shaka.net.NetworkingEngine.RequestType.SEGMENT,
          response,
          createSegmentContext(),
      );

      expect(spy).toHaveBeenCalled();
      const sentCmcdData = spy.calls.argsFor(0)[0];
      expect(sentCmcdData.cmsds.toString())
          .toBe(encodedCmsdsData.toString());
    });

    it('cmsds value should be Base64 encoded', () => {
      const cmcdManager = createCmcdManager(
          mockPlayer,
          {
            targets: [Object.assign({}, baseConfig.targets[0], {
              includeKeys: ['cmsds'],
            })],
          },
      );

      const response = createResponse();
      const cmsdsData = `ot=v,sf=h,st=v,d=5000,br=2000,n="OriginProviderA"`;

      response.headers['CMSD-Static'] = cmsdsData;
      const encodedCmsdsData = btoa(cmsdsData);

      const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

      cmcdManager.applyResponseData(
          shaka.net.NetworkingEngine.RequestType.SEGMENT,
          response,
          createSegmentContext(),
      );

      expect(spy).toHaveBeenCalled();
      const sentCmcdData = spy.calls.argsFor(0)[0];
      expect(sentCmcdData.cmsds.toString())
          .toBe(encodedCmsdsData.toString());
    });

    it('should not include cmsds if header is not present', () => {
      const cmcdManager = createCmcdManager(
          mockPlayer,
          {
            targets: [Object.assign({}, baseConfig.targets[0], {
              includeKeys: ['cmsds'],
            })],
          },
      );

      const response = createResponse();

      const spy = spyOn(cmcdManager, 'sendCmcdRequest_').and.callThrough();

      cmcdManager.applyResponseData(
          shaka.net.NetworkingEngine.RequestType.SEGMENT,
          response,
          createSegmentContext());

      const sentCmcdData = spy.calls.argsFor(0)[0];
      expect(sentCmcdData.cmsds).toBeUndefined();
    });

    // region CMCD V2 Event mode
    describe('Event Mode', () => {
      /**
       * A mock media element that extends FakeEventTarget and adds properties
       * for testing CMCD event mode.
       * @extends {shaka.util.FakeEventTarget}
       */
      class MockMediaElement extends shaka.util.FakeEventTarget {
        constructor() {
          super();
          /** @type {boolean} */
          this.muted = false;
        }
      }

      let networkingEngine;
      let requestSpy;
      /** @type {shaka.util.FakeEventTarget} */
      let mockPlayerWithNE;

      beforeEach(() => {
        requestSpy = jasmine.createSpy('request');
        networkingEngine = {
          request: requestSpy,
          configure: () => {},
          registerScheme: () => {},
        };
        mockPlayerWithNE = new shaka.util.FakeEventTarget();
        Object.assign(mockPlayerWithNE, mockPlayer, {
          getNetworkingEngine: () => networkingEngine,
        });
      });

      it('sends player state change events', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('pause'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=a')).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('seeking'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=k')).toBe(true);
      });

      it('sends mute and unmute events', () => {
        const mockMediaElement = /** @type {!MockMediaElement} */ (
          new MockMediaElement());

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['m', 'um'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        // Mute
        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=m')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);

        // Unmute
        mockMediaElement.muted = false;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=um')).toBe(true);
      });

      describe('Time interval events', () => {
        beforeEach(() => jasmine.clock().install());
        afterEach(() => jasmine.clock().uninstall());

        it('sends time interval events', () => {
          const mockVideo = new shaka.util.FakeEventTarget();
          const config = {
            version: 2,
            enabled: true,
            targets: [{
              enabled: true,
              url: 'https://example.com/cmcd',
              timeInterval: 1,
              includeKeys: ['e', 'v'],
            }],
          };

          const cmcdManager = createCmcdManager(
              mockPlayerWithNE,
              config,
          );
          cmcdManager.setMediaElement(mockVideo);
          cmcdManager.configure(config);

          mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

          jasmine.clock().tick(1001);
          const request = /** @type {!jasmine.Spy} */ (requestSpy)
              .calls.mostRecent().args[1];

          const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
          expect(bodyParts.some((p) => p === 'e=t')).toBe(true);
          expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
        });

        it('does not send time interval events when timeInterval is 0', () => {
          const mockVideo = new shaka.util.FakeEventTarget();
          const config = {
            version: 2,
            enabled: true,
            targets: [{
              enabled: true,
              url: 'https://example.com/cmcd',
              timeInterval: 0,
            }],
          };

          const cmcdManager = createCmcdManager(
              mockPlayerWithNE,
              config,
          );
          cmcdManager.setMediaElement(mockVideo);
          cmcdManager.configure(config);

          mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
          expect(requestSpy).toHaveBeenCalledTimes(1);

          jasmine.clock().tick(20000);

          expect(requestSpy).toHaveBeenCalledTimes(1);
        });

        it('uses default time interval when not specified', () => {
          const mockVideo = new shaka.util.FakeEventTarget();
          const config = {
            version: 2,
            enabled: true,
            targets: [{
              enabled: true,
              url: 'https://example.com/cmcd',
              // timeInterval is not defined, should default to 10s.
              includeKeys: ['e', 'v'],
            }],
          };

          const cmcdManager = createCmcdManager(
              mockPlayerWithNE,
              config,
          );
          cmcdManager.setMediaElement(mockVideo);
          cmcdManager.configure(config);

          mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
          expect(requestSpy).not.toHaveBeenCalled();

          // Default time interval is 10 seconds.
          jasmine.clock().tick(10001);

          expect(requestSpy).toHaveBeenCalledTimes(1);
          const request = /** @type {!jasmine.Spy} */ (requestSpy)
              .calls.mostRecent().args[1];

          const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
          expect(bodyParts.some((p) => p === 'e=t')).toBe(true);
          expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
        });
      });

      it('sends `msd` only on the first event', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            {
              targets: [{
                enabled: true,
                url: 'https://example.com/cmcd',
                includeKeys: ['msd', 'e', 'sta'],
              }],
            },
        );
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.onPlaybackPlay_();
        cmcdManager.onPlaybackPlaying_();

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        expect(requestSpy).toHaveBeenCalled();

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('msd='))).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('pause'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('msd='))).toBe(false);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        expect(requestSpy).toHaveBeenCalled();

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('msd='))).toBe(false);
      });

      it('filters events based on the target configuration', () => {
        const mockMediaElement = /** @type {!MockMediaElement} */ (
          new MockMediaElement());

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: ['m'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('pause'));
        // Should not have been called again for 'pause'
        expect(requestSpy).not.toHaveBeenCalled();

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('seeking'));
        // Should not have been called again for 'seeking'
        expect(requestSpy).not.toHaveBeenCalled();

        // Mute
        /** @type boolean */
        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'),
        );

        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=m')).toBe(true);
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(false);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(false);
        expect(bodyParts.some((p) => p === 'sta=a')).toBe(false);
        expect(bodyParts.some((p) => p === 'sta=k')).toBe(false);

        // Should not have been called again for 'seeking'
        expect(requestSpy).toHaveBeenCalledTimes(1);
      });

      it('includes other CMCD data with event requests', () => {
        const mockVideo = new shaka.util.FakeEventTarget();

        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content',
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'bl', 'mtp', 'cid'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('mtp='))).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content"')).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('mtp='))).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content"')).toBe(true);
      });

      it('does not send events if the target is disabled', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: false, // Target is disabled
            url: 'https://example.com/cmcd',
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('does not send events if CMCD version is 1', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 1, // CMCD v1
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('filters out keys that are not valid for event mode', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            // d and rtp are not valid for event mode
            includeKeys: ['e', 'sta', 'bl', 'd', 'rtp'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p === 'd=')).toBe(false);
        expect(bodyParts.some((p) => p === 'rtp=')).toBe(false);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts.some((p) => p === 'd=')).toBe(false);
        expect(bodyParts.some((p) => p === 'rtp=')).toBe(false);
      });

      it('sends events to multiple targets', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [
            {
              enabled: true,
              url: 'https://example.com/cmcd1',
              includeKeys: ['e', 'sta'],
              events: ['ps'],
            },
            {
              enabled: true,
              url: 'https://example.com/cmcd2',
              includeKeys: ['e', 'sta', 'v'],
              events: ['ps'],
            },
          ],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        // Dispatch 'play' event
        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        // After 'play', two requests should have been sent
        expect(requestSpy).toHaveBeenCalledTimes(2);

        const playCalls = /** @type {!jasmine.Spy} */
            (requestSpy).calls.all().map((call) => call.args[1]);
        const playCall1 = playCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd1'));
        const playCall2 = playCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd2'));

        // Assertions for the 'play' event
        const bodyParts1 = shaka.util.StringUtils.fromUTF8(playCall1.body).split(",");
        expect(bodyParts1.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts1.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts1.some((p) => p === 'v=2')).toBe(false);

        const bodyParts2 = shaka.util.StringUtils.fromUTF8(playCall2.body).split(",");
        expect(bodyParts2.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts2.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts2.some((p) => p === 'v=2')).toBe(true);


        // Reset the spy before the next event to have clean calls
        /** @type {!jasmine.Spy} */ (requestSpy).calls.reset();

        // Dispatch 'playing' event
        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));

        // After 'playing', two more requests should have been sent
        expect(requestSpy).toHaveBeenCalledTimes(2);

        const playingCalls = /** @type {!jasmine.Spy} */
          (requestSpy).calls.all().map((call) => call.args[1]);
        const playingCall1 = playingCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd1'));
        const playingCall2 = playingCalls.find((req) => req.uris[0].startsWith('https://example.com/cmcd2'));

        // Assertions for the 'playing' event
        const bodyParts3 = shaka.util.StringUtils.fromUTF8(playingCall1.body).split(",");
        expect(bodyParts3.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts3.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts3.some((p) => p === 'v=2')).toBe(false);

        const bodyParts4 = shaka.util.StringUtils.fromUTF8(playingCall2.body).split(",");
        expect(bodyParts4.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts4.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts4.some((p) => p === 'v=2')).toBe(true);
      });

      it('includes timestamp (ts) in event reports', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'ts'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);
      });

      it('should return only enabled event targets', () => {
        const targets = [
          {enabled: true, url: 'url1'},
          {enabled: false, url: 'url2'},
        ];
        const cmcdManager = createCmcdManager(mockPlayer, {targets});
        const enabledEventTargets = cmcdManager.getEventModeEnabledTargets_();
        expect(enabledEventTargets.length).toBe(1);
        expect(enabledEventTargets[0].url).toBe('url1');
      });

      it('should return an empty array if no targets are configured', () => {
        const cmcdManager = createCmcdManager(mockPlayer, {targets: []});
        const enabledEventTargets = cmcdManager.getEventModeEnabledTargets_();
        expect(enabledEventTargets.length).toBe(0);
      });

      it('should return an empty array if no event targets are enabled', () => {
        const targets = [
          {enabled: false, url: 'url1'},
        ];
        const cmcdManager = createCmcdManager(mockPlayer, {targets});
        const enabledEventTargets = cmcdManager.getEventModeEnabledTargets_();
        expect(enabledEventTargets.length).toBe(0);
      });

      it('does not include rc, url, ttfb or ttlb key', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            // rc, url, ttfb and ttlb are not valid for event mode
            includeKeys: ['e', 'sta', 'rc', 'url', 'ttfb', 'ttlb'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('rc='))).toBe(false);
        expect(bodyParts.some((p) => p.startsWith('url='))).toBe(false);
        expect(bodyParts.some((p) => p.startsWith('ttfb='))).toBe(false);
        expect(bodyParts.some((p) => p.startsWith('ttlb='))).toBe(false);
      });

      it('always includes timestamp (ts) in event reports', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'], // ts is omitted
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);
      });

      it('sends all allowed keys when includeKeys is empty', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content',
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: [],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockVideo);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

        expect(requestSpy).toHaveBeenCalled();
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");

        // Check for essential event keys
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);

        mockVideo.dispatchEvent(new shaka.util.FakeEvent('playing'));

        expect(requestSpy).toHaveBeenCalled();
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");

        // Check for essential event keys
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);

        // Check for other common keys that should be included by default
        expect(bodyParts.some((p) => p === `sid="${sessionId}"`)).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content"')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('mtp='))).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);
      });

      it('sends all event types when events array is empty', () => {
        const mockMediaElement = new MockMediaElement();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: [],
          }],
        };

        const cmcdManager = createCmcdManager(mockPlayerWithNE, config);
        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('playing'));
        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);

        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(3);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=m')).toBe(true);

        mockMediaElement.muted = false;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(4);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=um')).toBe(true);
      });

      it('sends all keys for all events when both arrays are empty', () => {
        const mockMediaElement = new MockMediaElement();
        const config = {
          version: 2,
          enabled: true,
          sessionId: sessionId,
          contentId: 'v2-event-content-all',
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: [],
            events: [],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );

        cmcdManager.setMediaElement(mockMediaElement);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('play'));
        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=s')).toBe(true);
        expect(bodyParts.some((p) => p === `sid="${sessionId}"`)).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content-all"')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);

        mockMediaElement.dispatchEvent(new shaka.util.FakeEvent('playing'));
        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];
  
        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=p')).toBe(true);
        expect(bodyParts.some((p) => p === `sid="${sessionId}"`)).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content-all"')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
        expect(bodyParts.some((p) => p.startsWith('ts='))).toBe(true);

        mockMediaElement.muted = true;
        mockMediaElement.dispatchEvent(
            new shaka.util.FakeEvent('volumechange'));
        expect(requestSpy).toHaveBeenCalledTimes(3);
        request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=m')).toBe(true);
        expect(bodyParts.some((p) => p === `sid="${sessionId}"`)).toBe(true);
        expect(bodyParts.some((p) => p === 'cid="v2-event-content-all"')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
      });

      it('sends rebuffering play state change event', () => {
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(new shaka.util.FakeEventTarget());
        cmcdManager.configure(config);

        // Simulate playback start
        cmcdManager.setBuffering(false);
        (/** @type {!jasmine.Spy} */ (requestSpy)).calls.reset();

        // Simulate rebuffering
        cmcdManager.setBuffering(true);

        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=r')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
      });

      it('sends preloading event', () => {
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta'],
            events: ['ps'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(new shaka.util.FakeEventTarget());
        cmcdManager.configure(config);

        cmcdManager.setStartTimeOfLoad(Date.now());

        expect(requestSpy).toHaveBeenCalledTimes(1);
        const request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=d')).toBe(true);
      });

      it('sends player expand and collapse events', () => {
        if (!document.fullscreenEnabled) {
          pending('This test requires fullscreen support.');
        }
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e'],
            events: ['pe', 'pc'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        const fullscreenChangeEvent = document.createEvent('event');
        fullscreenChangeEvent.initEvent('fullscreenchange', false, false);

        // Mock fullscreenElement to simulate entering fullscreen
        Object.defineProperty(document, 'fullscreenElement', {
          value: document,
          writable: true,
        });

        document.dispatchEvent(fullscreenChangeEvent);
        expect(requestSpy).toHaveBeenCalled();
        let request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pe')).toBe(true);

        // Mock fullscreenElement to simulate exiting fullscreen
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
        });

        document.dispatchEvent(fullscreenChangeEvent);
        expect(requestSpy).toHaveBeenCalled();
        request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pc')).toBe(true);

        // Restore original property
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: false,
        });
      });

      it('sends complete event', () => {
        const completeConfig = createCmcdConfig({
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        });

        const cmcdManager = new CmcdManager(
            /** @type {shaka.Player} */ (mockPlayerWithNE),
            completeConfig,
        );

        cmcdManager.setMediaElement(
            /** @type {!HTMLMediaElement} */
            (/** @type {*} */ (new shaka.util.FakeEventTarget())),
        );

        cmcdManager.configure(completeConfig);

        mockPlayerWithNE.dispatchEvent(new shaka.util.FakeEvent('complete'));

        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=e')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
      });

      it('sends waiting event', () => {
        const completeConfig = createCmcdConfig({
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e', 'sta', 'v'],
            events: ['ps'],
          }],
        });

        const cmcdManager = new CmcdManager(
            /** @type {shaka.Player} */ (mockPlayerWithNE),
            completeConfig,
        );

        cmcdManager.setMediaElement(
            /** @type {!HTMLMediaElement} */
            (/** @type {*} */ (new shaka.util.FakeEventTarget())),
        );

        cmcdManager.configure(completeConfig);

        mockPlayerWithNE.dispatchEvent(new shaka.util.FakeEvent('buffering'));

        const request = /** @type {!jasmine.Spy} */ (requestSpy)
            .calls.mostRecent().args[1];

        const bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=ps')).toBe(true);
        expect(bodyParts.some((p) => p === 'sta=w')).toBe(true);
        expect(bodyParts.some((p) => p === 'v=2')).toBe(true);
      });

      it('sends Picture-in-Picture events', () => {
        const mockVideo = new shaka.util.FakeEventTarget();
        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e'],
            events: ['pe', 'pc'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        mockVideo.dispatchEvent(
            new shaka.util.FakeEvent('enterpictureinpicture'));

        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pe')).toBe(true);

        // Simulate leaving Picture-in-Picture
        mockVideo.dispatchEvent(new shaka.util.FakeEvent(
            'leavepictureinpicture'));

        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];
        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pc')).toBe(true);
      });

      it('sends webkit presentation mode change events', () => {
        /**
         * @extends {shaka.util.FakeEventTarget}
         */
        class MockWebKitVideo extends shaka.util.FakeEventTarget {
          constructor() {
            super();
            /** @type {string} */
            this.webkitPresentationMode = 'inline';
          }
        }
        const mockVideo = new MockWebKitVideo();

        const config = {
          version: 2,
          enabled: true,
          targets: [{
            enabled: true,
            url: 'https://example.com/cmcd',
            includeKeys: ['e'],
            events: ['pe', 'pc'],
          }],
        };

        const cmcdManager = createCmcdManager(
            mockPlayerWithNE,
            config,
        );
        cmcdManager.setMediaElement(mockVideo);
        cmcdManager.configure(config);

        // Simulate entering fullscreen via webkit presentation mode
        mockVideo.webkitPresentationMode = 'fullscreen';
        mockVideo.dispatchEvent(
            new shaka.util.FakeEvent('webkitpresentationmodechanged'));

        expect(requestSpy).toHaveBeenCalledTimes(1);
        let request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        let bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pe')).toBe(true);

        // Simulate exiting fullscreen via webkit presentation mode
        mockVideo.webkitPresentationMode = 'inline';
        mockVideo.dispatchEvent(
            new shaka.util.FakeEvent('webkitpresentationmodechanged'));

        expect(requestSpy).toHaveBeenCalledTimes(2);
        request = (/** @type {!jasmine.Spy} */ (requestSpy))
            .calls.mostRecent().args[1];

        bodyParts = shaka.util.StringUtils.fromUTF8(request.body).split(",");
        expect(bodyParts.some((p) => p === 'e=pc')).toBe(true);
      });

      it('sends separate reports with correct keys for multiple targets',
          () => {
            // Create fresh spy to avoid interference from other tests
            const freshRequestSpy = jasmine.createSpy('request');
            const freshNetworkingEngine = {
              request: freshRequestSpy,
              configure: () => {},
              registerScheme: () => {},
            };
            const freshMockPlayerWithNE = new shaka.util.FakeEventTarget();
            Object.assign(freshMockPlayerWithNE, mockPlayer, {
              getNetworkingEngine: () => freshNetworkingEngine,
            });

            const mockVideo = new shaka.util.FakeEventTarget();
            const config = {
              version: 2,
              enabled: true,
              targets: [
                {
                  enabled: true,
                  url: 'https://target1.com/cmcd',
                  includeKeys: ['ts', 'rc', 'url'],
                  events: ['rr'], // Response events
                },
                {
                  enabled: true,
                  url: 'https://target2.com/cmcd',
                  includeKeys: ['e', 'sta', 'ts'],
                  events: ['ps'], // Player state events
                },
              ],
            };

            const cmcdManager = createCmcdManager(
                freshMockPlayerWithNE, config);

            cmcdManager.setMediaElement(mockVideo);

            // Reset spy call count after setup
            freshRequestSpy.calls.reset();

            // Trigger first event type (rr event)
            cmcdManager.applyResponseSegmentData(
                {uri: 'https://example.com/segment.mp4', headers: {}},
                createResponseWithRealTiming(),
                {});

            // Trigger second event type (ps event)
            mockVideo.dispatchEvent(new shaka.util.FakeEvent('play'));

            // Should have called request spy twice, once for each target
            expect(freshRequestSpy).toHaveBeenCalledTimes(2);

            const firstRequest = freshRequestSpy.calls.argsFor(0)[1];
            const secondRequest = freshRequestSpy.calls.argsFor(1)[1];

            const firstBodyParts = shaka.util.StringUtils.fromUTF8(firstRequest.body).split(",");
            const secondBodyParts = shaka.util.StringUtils.fromUTF8(secondRequest.body).split(",");

            expect(firstRequest.uris[0]).toContain('target1.com');
            expect(firstBodyParts.some((p) => p === 'e=rr')).toBe(true);
            expect(firstBodyParts.some((p) => p.startsWith('ts='))).toBe(true);
            expect(firstBodyParts.some((p) => p.startsWith('rc'))).toBe(true);
            expect(firstBodyParts.some((p) => p.startsWith('url'))).toBe(true);
            expect(firstBodyParts.some((p) => p.startsWith('sta='))).toBe(false);

            expect(secondRequest.uris[0]).toContain('target2.com');
            expect(secondBodyParts.some((p) => p === 'e=ps')).toBe(true);
            expect(secondBodyParts.some((p) => p === 'sta=s')).toBe(true);
            expect(secondBodyParts.some((p) => p.startsWith('ts='))).toBe(true);
            expect(secondBodyParts.some((p) => p.startsWith('rc'))).toBe(false);
            expect(secondBodyParts.some((p) => p.startsWith('url'))).toBe(false);            
          });

      it('maintains separate state between targets processing same event',
          () => {
            // Create fresh spy to avoid interference from other tests
            const freshRequestSpy = jasmine.createSpy('request');
            const freshNetworkingEngine = {
              request: freshRequestSpy,
              configure: () => {},
              registerScheme: () => {},
            };
            const freshMockPlayerWithNE = new shaka.util.FakeEventTarget();
            Object.assign(freshMockPlayerWithNE, mockPlayer, {
              getNetworkingEngine: () => freshNetworkingEngine,
            });

            const mockVideo = new shaka.util.FakeEventTarget();
            const config = {
              version: 2,
              enabled: true,
              targets: [
                {
                  enabled: true,
                  url: 'https://target1.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'],
                },
                {
                  enabled: true,
                  url: 'https://target2.com/cmcd',
                  includeKeys: ['sn'],
                  events: ['rr'], // Same event type to trigger contamination
                },
              ],
            };

            const cmcdManager = createCmcdManager(
                freshMockPlayerWithNE, config);
            cmcdManager.setMediaElement(mockVideo);

            // Reset spy call count after setup
            freshRequestSpy.calls.reset();

            // Trigger single event that should affect both targets
            cmcdManager.applyResponseSegmentData(
                {uri: 'https://example.com/segment.mp4', headers: {}},
                createResponseWithRealTiming(),
                {});

            // Should have called request spy twice, once for each target
            expect(freshRequestSpy).toHaveBeenCalledTimes(2);

            const firstRequest = freshRequestSpy.calls.argsFor(0)[1];
            const secondRequest = freshRequestSpy.calls.argsFor(1)[1];

            const firstDecodedUri = decodeURIComponent(firstRequest.uris[0]);
            const secondDecodedUri = decodeURIComponent(secondRequest.uris[0]);

            const firstBodyParts = shaka.util.StringUtils.fromUTF8(firstRequest.body).split(",");
            const secondBodyParts = shaka.util.StringUtils.fromUTF8(secondRequest.body).split(",");

            // Both targets should have independent sequence numbers = 1
            expect(firstBodyParts.some((p) => p === "sn=1")).toBe(true);
            expect(secondBodyParts.some((p) => p === "sn=1")).toBe(true);

            expect(firstRequest.uris[0]).toContain('target1.com');
            expect(secondRequest.uris[0]).toContain('target2.com');
          });
    });
  });
});
