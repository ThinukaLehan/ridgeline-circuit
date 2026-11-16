/* Sound. The engine is synthesised the way a real one makes noise: one exhaust pressure pulse per
   cylinder firing, timed by the firing order, sent through resonating pipes and a muffler.
   Tyre roar, wind, tyre squeal and rain are shaped noise. */
(function (root) {
  'use strict';
  var RC = root.RC = root.RC || {};

  RC.ENGINE_WORKLET_SRC = [
    'class EngineProc extends AudioWorkletProcessor{',
    ' static get parameterDescriptors(){return [{name:"rpm",defaultValue:900,automationRate:"k-rate"},{name:"thr",defaultValue:0,automationRate:"k-rate"},{name:"gain",defaultValue:0,automationRate:"k-rate"}];}',
    ' constructor(){super();this.c=null;this.ph=0;this.rpm=900;this.thr=0;this.g=0;this.seed=12345;',
    '  this.d1=new Float32Array(4096);this.d2=new Float32Array(4096);this.w=0;this.f1=0;this.f2=0;this.l1=0;this.l2=0;this.hx=0;this.hy=0;this.pop=0;this.p1=0;this.p2=0;this.wob=0;',
    '  this.port.onmessage=(e)=>{this.setCfg(e.data);};}',
    ' setCfg(c){this.c=c;if(c&&!c.ev){var n=c.offs.length;this.amp=new Float32Array(n);this.last=new Float32Array(n);for(var i=0;i<n;i++){this.amp[i]=c.bank[i];this.last[i]=0;}this.D1=Math.max(8,Math.min(4000,Math.round(c.pipe*sampleRate)));this.D2=Math.max(6,Math.round(this.D1*0.618));}}',
    ' rnd(){this.seed=(this.seed*1664525+1013904223)|0;return (this.seed>>>8)/16777216;}',
    ' process(inputs,outputs,params){',
    '  var out=outputs[0][0],N=out.length,c=this.c;if(!c){return true;}',
    '  var rT=params.rpm[0],tT=params.thr[0],gT=params.gain[0],sr=sampleRate,i,k;',
    '  if(c.ev){',
    '   for(i=0;i<N;i++){this.rpm+=(rT-this.rpm)*0.0015;this.thr+=(tT-this.thr)*0.002;this.g+=(gT-this.g)*0.002;',
    '    var f=this.rpm/60*3.0;this.p1+=f/sr;if(this.p1>=1)this.p1-=1;this.p2+=f*2.74/sr;if(this.p2>=1)this.p2-=1;this.wob+=5.1/sr;',
    '    var a=0.10+0.5*this.thr,lv=Math.min(1,this.rpm/2500);',
    '    var s=Math.sin(6.2832*this.p1)*0.55+Math.sin(12.5664*this.p1)*0.18+Math.sin(6.2832*this.p2)*0.22*(0.3+this.thr)+(this.rnd()-0.5)*0.03;',
    '    out[i]=s*a*lv*(1+0.03*Math.sin(6.2832*this.wob))*this.g*0.5;}',
    '   return true;}',
    '  var n=c.offs.length,rpm0=this.rpm,cyc,dk,fp=c.fp,jit=c.jit;',
    '  var fc=c.lp0+this.thr*c.lp1+rpm0*c.lp2,al=1-Math.exp(-6.2832*fc/sr);',
    '  var overrun=(this.thr<0.08&&rpm0>c.redline*0.45);',
    '  for(i=0;i<N;i++){',
    '   this.rpm+=(rT-this.rpm)*0.002;this.thr+=(tT-this.thr)*0.003;this.g+=(gT-this.g)*0.002;',
    '   var rpm=this.rpm<300?300:this.rpm,thr=this.thr;cyc=120/rpm;dk=c.dk*(0.55+rpm/3200);',
    '   this.ph+=rpm/(120*sr);if(this.ph>=1)this.ph-=1;',
    '   var s=0,env=0;',
    '   for(k=0;k<n;k++){var p=this.ph-c.offs[k];if(p<0)p+=1;',
    '    if(p<this.last[k]){this.amp[k]=c.bank[k]*(1+(this.rnd()-0.5)*jit*(1+(1-thr)*1.6));if(overrun&&this.rnd()<c.pop)this.pop=1;}',
    '    this.last[k]=p;var t=p*cyc,e=Math.exp(-t*dk);',
    '    s+=this.amp[k]*e*Math.sin(6.2832*fp*t*(1+0.25*thr));env+=this.amp[k]*e*e;}',
    '   var nz=this.rnd()*2-1;',
    '   var x=s*(0.30+0.70*thr)+nz*env*(0.04+0.42*thr)*c.nz+nz*this.pop*0.9;this.pop*=0.9985;',
    '   var w=this.w,r1=this.d1[(w-this.D1)&4095],r2=this.d2[(w-this.D2)&4095];',
    '   this.f1+=(r1-this.f1)*0.42;this.f2+=(r2-this.f2)*0.5;',
    '   var y1=x-c.fb*this.f1,y2=x+c.fb*0.8*this.f2;this.d1[w&4095]=y1;this.d2[w&4095]=y2;this.w=(w+1)&4095;',
    '   var z=y1*0.6+y2*0.45+s*0.06*thr;',
    '   this.l1+=(z-this.l1)*al;this.l2+=(this.l1-this.l2)*al;',
    '   var hp=this.l2-this.hx+0.996*this.hy;this.hx=this.l2;this.hy=hp;',
    '   var o=hp*c.drive*(0.55+0.45*thr);o=o/(1+Math.abs(o));',
    '   out[i]=o*this.g;}',
    '  return true;}}',
    'registerProcessor("rc-engine",EngineProc);'
  ].join('\n');

  var ac = null, eng = null, engGain, master, comp, ready = false, fallback = null, muted = false, curCar = null;
  var road, roadF, roadG, wind, windF, windG, sq, sqF1, sqF2, sqG, rain, rainF, rainG;

  function noiseBuf() {
    var b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 6; }
    return b;
  }
  function noiseSrc(buf) { var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  function biq(type, f, q) { var n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
  function gn(v) { var g = ac.createGain(); g.gain.value = v; return g; }

  function sendCfg() {
    if (!eng || !curCar) return;
    var s = curCar.snd, cfg = {};
    for (var k in s) cfg[k] = s[k];
    cfg.redline = curCar.redline;
    eng.port.postMessage(cfg);
  }

  RC.audio = {
    start: function () {
      if (ac) { try { ac.resume(); } catch (e) {} return; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext; ac = new AC();
        comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        master = gn(muted ? 0 : 0.9); master.connect(comp); comp.connect(ac.destination);
        var buf = noiseBuf();
        road = noiseSrc(buf); roadF = biq('bandpass', 300, 0.7); roadG = gn(0); road.connect(roadF); roadF.connect(roadG); roadG.connect(master);
        wind = noiseSrc(buf); windF = biq('bandpass', 900, 0.5); windG = gn(0); wind.connect(windF); windF.connect(windG); windG.connect(master);
        sq = noiseSrc(buf); sqF1 = biq('bandpass', 1150, 14); sqF2 = biq('bandpass', 1620, 18); sqG = gn(0);
        sq.connect(sqF1); sq.connect(sqF2); sqF1.connect(sqG); sqF2.connect(sqG); sqG.connect(master);
        rain = noiseSrc(buf); rainF = biq('highpass', 2500, 0.5); rainG = gn(0); rain.connect(rainF); rainF.connect(rainG); rainG.connect(master);
        engGain = gn(1); engGain.connect(master);
        var ok = false;
        if (ac.audioWorklet && window.AudioWorkletNode) {
          var url = URL.createObjectURL(new Blob([RC.ENGINE_WORKLET_SRC], { type: 'application/javascript' }));
          ac.audioWorklet.addModule(url).then(function () {
            eng = new AudioWorkletNode(ac, 'rc-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
            eng.connect(engGain); ready = true; sendCfg();
          }).catch(function () { makeFallback(); });
          ok = true;
        }
        if (!ok) makeFallback();
      } catch (e) { ac = null; }
    },
    setCar: function (spec) { curCar = spec; sendCfg(); },
    setMuted: function (m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.05); },
    pause: function (p) { if (ac) { try { p ? ac.suspend() : ac.resume(); } catch (e) {} } },
    // st: {rpm, thr, speed (m/s), slide 0..1, surface id, rain bool, onRoad bool, active bool}
    update: function (st) {
      if (!ac) return;
      var t = ac.currentTime, v = st.speed, on = st.active ? 1 : 0.35;
      if (eng && ready) {
        eng.parameters.get('rpm').setValueAtTime(st.rpm, t);
        eng.parameters.get('thr').setValueAtTime(st.thr, t);
        eng.parameters.get('gain').setValueAtTime(0.5 * on, t);
      } else if (fallback) {
        var f = st.rpm / 30; fallback.o1.frequency.setTargetAtTime(f, t, 0.03); fallback.o2.frequency.setTargetAtTime(f / 2, t, 0.03);
        fallback.f.frequency.setTargetAtTime(260 + st.rpm * 0.22 + st.thr * 900, t, 0.05); fallback.g.gain.setTargetAtTime((0.03 + st.thr * 0.045) * on, t, 0.06);
      }
      var loose = st.surface === 'gravel' || !st.onRoad, snow = st.surface === 'snow';
      var rv = Math.min(1, v / 45);
      roadF.frequency.setTargetAtTime(loose ? 180 + v * 9 : (snow ? 140 + v * 4 : 260 + v * 14), t, 0.1);
      roadG.gain.setTargetAtTime(rv * (loose ? 0.5 : (snow ? 0.16 : (st.surface === 'wet' ? 0.3 : 0.2))), t, 0.1);
      windF.frequency.setTargetAtTime(500 + v * 22, t, 0.1);
      windG.gain.setTargetAtTime(Math.min(0.3, v * v / 14000), t, 0.15);
      var squeal = (st.onRoad && (st.surface === 'dry' || st.surface === 'wet')) ? st.slide * (st.surface === 'wet' ? 0.35 : 1) : 0;
      sqF1.frequency.setTargetAtTime(950 + 300 * st.slide + v * 3, t, 0.05); sqF2.frequency.setTargetAtTime(1400 + 420 * st.slide + v * 4, t, 0.05);
      sqG.gain.setTargetAtTime(squeal * 0.5, t, 0.05);
      rainG.gain.setTargetAtTime(st.rain ? 0.05 + Math.min(0.06, v / 600) : 0, t, 0.3);
    }
  };
  function makeFallback() {
    try {
      var o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = biq('lowpass', 600, 1.2), g = gn(0);
      o1.type = 'sawtooth'; o2.type = 'square'; o1.connect(f); o2.connect(f); f.connect(g); g.connect(engGain); o1.start(); o2.start();
      fallback = { o1: o1, o2: o2, f: f, g: g };
    } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
