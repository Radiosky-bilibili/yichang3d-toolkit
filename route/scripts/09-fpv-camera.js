/* ====== FPV 注入模块 (MINIS) ====== */
/* ===================================================================
   FPV 航线自动飞行 · 注入模块 (MINIS)
   依赖同作用域内的：toLocal / ter / camera / renderer / scene / sky / LANDMARKS / clamp / smoothstep
   对外 API：
     FPV.start(cfg)      开启（cfg 可选，覆盖默认）
     FPV.stop()          关闭
     FPV.seek(km)        跳到指定里程
     FPV.tick(dt)        手动推进（animate 里自动调用）
     FPV.stepAndSnap(...)录制辅助：推进一帧并离屏出图上传
     FPV.info()          当前状态
   =================================================================== */
(function () {
  const LL = [[110.925666,30.881132],[110.926728,30.88056],[110.927769,30.879961],[110.928785,30.87933],[110.92977,30.878665],[110.930733,30.877977],[110.931691,30.877283],[110.932665,30.876605],[110.933671,30.875963],[110.934713,30.875366],[110.935785,30.874808],[110.936876,30.874277],[110.937975,30.873761],[110.939081,30.873253],[110.940195,30.87276],[110.941324,30.872293],[110.942474,30.871864],[110.943646,30.871484],[110.944839,30.871153],[110.946047,30.870865],[110.947265,30.870612],[110.948489,30.870381],[110.949717,30.870162],[110.950945,30.869947],[110.952174,30.869735],[110.953408,30.86954],[110.95465,30.8694],[110.955901,30.869349],[110.957153,30.869403],[110.958397,30.869535],[110.959638,30.869685],[110.960887,30.869789],[110.962139,30.869802],[110.963388,30.869706],[110.964619,30.869511],[110.965832,30.869237],[110.96702,30.868895],[110.968179,30.868487],[110.9693,30.868006],[110.970369,30.867444],[110.971378,30.866806],[110.972328,30.866104],[110.973233,30.865359],[110.974107,30.864589],[110.974966,30.863805],[110.975818,30.863015],[110.976665,30.862222],[110.977507,30.861425],[110.97834,30.86062],[110.97916,30.859806],[110.979963,30.85898],[110.980752,30.858144],[110.98153,30.857301],[110.982308,30.856456],[110.983092,30.855616],[110.983885,30.854783],[110.984685,30.853955],[110.985486,30.853126],[110.986273,30.852289],[110.987039,30.851437],[110.987778,30.850567],[110.988494,30.849684],[110.989198,30.848793],[110.989904,30.847903],[110.990616,30.847018],[110.991336,30.846137],[110.992051,30.845254],[110.992754,30.844362],[110.993438,30.84346],[110.994105,30.842549],[110.99477,30.841637],[110.995448,30.840731],[110.996146,30.839837],[110.996863,30.838955],[110.99759,30.838077],[110.998316,30.837199],[110.999028,30.836314],[110.999713,30.835413],[111.000357,30.834489],[111.000938,30.833536],[111.00144,30.832549],[111.001847,30.831532],[111.002161,30.83049],[111.002396,30.829432],[111.002582,30.828368],[111.002766,30.827303],[111.003014,30.826248],[111.003404,30.825226],[111.003995,30.824278],[111.004777,30.823439],[111.005676,30.822689],[111.006618,30.821979],[111.007565,30.821274],[111.008524,30.820579],[111.009523,30.81993],[111.010572,30.819341],[111.011657,30.818802],[111.012754,30.818281],[111.013858,30.81777],[111.014982,30.817294],[111.016143,30.816888],[111.017344,30.816583],[111.018575,30.81638],[111.019821,30.816266],[111.021074,30.816225],[111.022327,30.816243],[111.023578,30.816312],[111.024824,30.816429],[111.026064,30.816588],[111.027297,30.816783],[111.028522,30.817009],[111.02974,30.817264],[111.03095,30.817546],[111.032152,30.81785],[111.033348,30.818175],[111.034535,30.81852],[111.035716,30.818882],[111.036889,30.819261],[111.038056,30.819654],[111.039215,30.820063],[111.040369,30.820486],[111.041514,30.820924],[111.042651,30.821376],[111.043781,30.821843],[111.044902,30.822324],[111.046014,30.822821],[111.047116,30.823334],[111.048208,30.823863],[111.049289,30.824408],[111.050359,30.824969],[111.051418,30.825544],[111.05247,30.826131],[111.053514,30.826727],[111.054552,30.82733],[111.055586,30.82794],[111.056615,30.828555],[111.057639,30.829175],[111.058662,30.829797],[111.059682,30.830423],[111.0607,30.831051],[111.061718,30.83168],[111.062735,30.832309],[111.063753,30.832937],[111.064772,30.833564],[111.065793,30.834189],[111.066815,30.834812],[111.067838,30.835435],[111.06886,30.836057],[111.069883,30.836679],[111.070905,30.837303],[111.071922,30.837932],[111.072935,30.838566],[111.073941,30.839209],[111.07494,30.839859],[111.075932,30.840517],[111.076918,30.841182],[111.077896,30.841855],[111.078867,30.842536],[111.07983,30.843224],[111.080789,30.843918],[111.081746,30.844613],[111.082704,30.845307],[111.083656,30.846008],[111.084592,30.846723],[111.085508,30.847459],[111.08641,30.848206],[111.08732,30.848946],[111.088261,30.849657],[111.089249,30.85032],[111.090277,30.850935],[111.091331,30.851518],[111.092401,30.852077],[111.093492,30.852609],[111.094616,30.853085],[111.095786,30.853468],[111.097002,30.853729],[111.098244,30.85387],[111.099495,30.853914],[111.100749,30.853893],[111.102,30.853822],[111.103246,30.853703],[111.104483,30.853528],[111.105704,30.853285],[111.106903,30.852973],[111.108076,30.852595],[111.10922,30.852155],[111.11033,30.851654],[111.111395,30.851087],[111.112415,30.850462],[111.113398,30.849795],[111.114367,30.849112],[111.115352,30.848445],[111.116367,30.847814],[111.117419,30.847229],[111.118503,30.846689],[111.119614,30.84619],[111.120744,30.845726],[111.121891,30.845292],[111.123051,30.844882],[111.124218,30.844489],[111.125393,30.844113],[111.126577,30.843761],[111.127776,30.843445],[111.128992,30.843186],[111.130225,30.842992],[111.131468,30.842852],[111.132712,30.842724],[111.133952,30.842564],[111.135185,30.842369],[111.136423,30.842199],[111.137674,30.842156],[111.138914,30.842301],[111.140122,30.84259],[111.141319,30.842909],[111.142538,30.843158],[111.14378,30.843295],[111.145033,30.843335],[111.146287,30.84331],[111.147538,30.843246],[111.148786,30.843151],[111.150032,30.843029],[111.151273,30.842878],[111.152509,30.842696],[111.153735,30.842475],[111.154949,30.842206],[111.156141,30.841874],[111.1573,30.841463],[111.158409,30.840962],[111.159459,30.840376],[111.160453,30.83972],[111.161408,30.839023],[111.162344,30.838307],[111.16327,30.837581],[111.164172,30.836834],[111.165024,30.836045],[111.165793,30.835195],[111.166453,30.834281],[111.166998,30.833312],[111.167438,30.832304],[111.167797,30.831273],[111.168107,30.83023],[111.168405,30.829184],[111.168724,30.828144],[111.169085,30.827113],[111.169498,30.826097],[111.169959,30.825096],[111.170451,30.824105],[111.170948,30.823117],[111.171414,30.822118],[111.171811,30.821097],[111.172112,30.820052],[111.172312,30.81899],[111.172427,30.817918],[111.172501,30.816843],[111.172577,30.815768],[111.17271,30.814698],[111.172948,30.813642],[111.17332,30.812613],[111.173794,30.811617],[111.174284,30.810626],[111.174647,30.809597],[111.174718,30.808526],[111.174402,30.807489],[111.173762,30.806567],[111.172936,30.805757],[111.172032,30.805012],[111.171112,30.804281],[111.170207,30.803536],[111.169331,30.802766],[111.168491,30.801966],[111.167693,30.801136],[111.166938,30.800277],[111.166222,30.799393],[111.165524,30.798498],[111.164824,30.797605],[111.1641,30.796726],[111.163344,30.795867],[111.162558,30.795027],[111.161756,30.7942],[111.160953,30.793373],[111.160163,30.792537],[111.159397,30.791685],[111.158656,30.790817],[111.157937,30.789934],[111.157236,30.789041],[111.156557,30.788137],[111.155915,30.787212],[111.155341,30.786255],[111.154871,30.785257],[111.154551,30.784216],[111.154425,30.783146],[111.154527,30.782074],[111.154881,30.781043],[111.155491,30.780105],[111.156327,30.779306],[111.157335,30.778667],[111.158456,30.778189],[111.159649,30.77786],[111.160884,30.777682],[111.162136,30.777653],[111.163384,30.777754],[111.164622,30.777922],[111.165863,30.778071],[111.167114,30.778118],[111.168362,30.778016],[111.16958,30.777766],[111.17076,30.777404],[111.171906,30.776967],[111.17303,30.776492],[111.174151,30.776009],[111.175286,30.775551],[111.176445,30.775142],[111.177631,30.774793],[111.178834,30.774491],[111.180045,30.774212],[111.181255,30.773931],[111.182462,30.773637],[111.183664,30.773334],[111.18487,30.773039],[111.186084,30.772769],[111.187306,30.772532],[111.188536,30.772324],[111.189771,30.772137],[111.191007,30.771957],[111.192243,30.771777],[111.193478,30.771593],[111.194714,30.771413],[111.195954,30.771253],[111.197199,30.771132],[111.19845,30.771069],[111.199704,30.771071],[111.200956,30.771131],[111.202204,30.77123],[111.203451,30.771341],[111.204699,30.771446],[111.205948,30.771535],[111.207199,30.771602],[111.208452,30.771639],[111.209706,30.771631],[111.210956,30.771562],[111.212197,30.771412],[111.213419,30.771172],[111.214613,30.770844],[111.215778,30.770449],[111.21693,30.770023],[111.218085,30.769605],[111.219257,30.769222],[111.220447,30.768886],[111.221652,30.768587],[111.222867,30.76832],[111.224092,30.768095],[111.225331,30.767934],[111.226581,30.767856],[111.227835,30.767854],[111.229088,30.767896],[111.23034,30.767941],[111.231593,30.767974],[111.232845,30.768008],[111.234097,30.768071],[111.235344,30.76818],[111.236588,30.768313],[111.237835,30.76843],[111.239086,30.768486],[111.240339,30.768455],[111.241582,30.768322],[111.242808,30.768097],[111.244015,30.767807],[111.245212,30.767487],[111.246413,30.767176],[111.247622,30.766896],[111.248844,30.766652],[111.250071,30.766431],[111.251299,30.766216],[111.252525,30.765991],[111.253747,30.765751],[111.254966,30.765499],[111.256183,30.765243],[111.257403,30.764992],[111.258624,30.764749],[111.259848,30.764517],[111.261075,30.764295],[111.262304,30.764082],[111.263535,30.763879],[111.264767,30.763678],[111.265995,30.763463],[111.267213,30.763208],[111.268409,30.762889],[111.269573,30.76249],[111.270695,30.762009],[111.271774,30.761461],[111.272815,30.76086],[111.273819,30.760215],[111.274785,30.759529],[111.275706,30.758799],[111.276576,30.758023],[111.277383,30.7572],[111.278117,30.756327],[111.278761,30.755403],[111.279288,30.754425],[111.279675,30.753402],[111.279917,30.752345],[111.280025,30.751272],[111.280018,30.750196],[111.279907,30.749123],[111.279689,30.748063],[111.279367,30.747021],[111.278986,30.745995],[111.27862,30.744964],[111.278343,30.743914],[111.278172,30.742847],[111.278046,30.741775],[111.27788,30.740708],[111.277609,30.739655],[111.277226,30.73863],[111.276763,30.737629],[111.276254,30.736645],[111.275724,30.735668],[111.275196,30.734691],[111.274682,30.733708],[111.274195,30.732715],[111.273744,30.731709],[111.273337,30.73069],[111.272974,30.729659],[111.27265,30.728618],[111.27236,30.72757],[111.272097,30.726516],[111.271853,30.725459],[111.27162,30.724401],[111.271396,30.72334],[111.271183,30.722278],[111.27098,30.721214],[111.270795,30.720148],[111.270631,30.71908],[111.270497,30.718009],[111.270394,30.716935],[111.270333,30.715858],[111.270316,30.71478],[111.270349,30.713703],[111.270438,30.712628],[111.270585,30.711558],[111.270795,30.710495],[111.271069,30.709444],[111.27141,30.708407],[111.271817,30.707387],[111.272289,30.70639],[111.272826,30.705415],[111.273423,30.704467],[111.274077,30.703549],[111.274783,30.702657],[111.275536,30.701796],[111.276331,30.700962],[111.277162,30.700156],[111.278025,30.699373],[111.278912,30.698613],[111.279823,30.697872],[111.280752,30.697148],[111.281696,30.696438],[111.282649,30.695739],[111.283612,30.69505],[111.284583,30.694366],[111.285558,30.693689],[111.286534,30.693013],[111.287513,30.69234],[111.288492,30.691666],[111.289469,30.690991],[111.290445,30.690313],[111.291416,30.689632],[111.292384,30.688947],[111.293346,30.688256],[111.294303,30.687559],[111.295252,30.686856],[111.296196,30.686145],[111.297132,30.685428],[111.298059,30.684703],[111.298979,30.68397],[111.29989,30.683229],[111.30079,30.68248],[111.301682,30.681722],[111.302564,30.680956],[111.303436,30.680182],[111.3043,30.6794],[111.305154,30.678611],[111.306,30.677815],[111.306839,30.677014],[111.307671,30.676208],[111.308499,30.675398],[111.309322,30.674584],[111.310141,30.673768],[111.310957,30.67295],[111.31177,30.672129],[111.31258,30.671306],[111.313389,30.670482],[111.314195,30.669657],[111.315,30.66883],[111.315802,30.668001],[111.316603,30.667172],[111.317403,30.666342],[111.318201,30.66551],[111.318997,30.664677],[111.319792,30.663843],[111.320585,30.663008],[111.321377,30.662172],[111.322167,30.661336],[111.322958,30.660498],[111.323746,30.65966],[111.324534,30.658821],[111.32532,30.657981],[111.326106,30.657141],[111.32689,30.6563],[111.327675,30.655458],[111.328457,30.654616],[111.329239,30.653773],[111.33002,30.65293],[111.330801,30.652085],[111.33158,30.651241],[111.332359,30.650395],[111.333138,30.649549],[111.333915,30.648704],[111.334691,30.647857],[111.335467,30.647011],[111.336242,30.646163],[111.337017,30.645315],[111.337792,30.644466],[111.338565,30.643618],[111.339338,30.642768],[111.34011,30.641919],[111.340882,30.641069],[111.341653,30.640218],[111.342424,30.639368],[111.343194,30.638517],[111.343964,30.637666],[111.344732,30.636814],[111.345501,30.635961],[111.34627,30.635109],[111.347038,30.634257],[111.347805,30.633404],[111.348572,30.63255],[111.349338,30.631697],[111.350104,30.630843],[111.35087,30.629989],[111.351635,30.629134],[111.352399,30.628279],[111.353164,30.627425],[111.353928,30.62657],[111.354691,30.625714],[111.355455,30.624858],[111.356219,30.624002],[111.356981,30.623146],[111.357745,30.622291],[111.358509,30.621435],[111.359272,30.62058],[111.360036,30.619724],[111.3608,30.618869],[111.361564,30.618014],[111.36233,30.617159],[111.363095,30.616305],[111.36386,30.615451],[111.364626,30.614596],[111.365391,30.613742],[111.366157,30.612888],[111.366922,30.612033],[111.367688,30.611178],[111.368453,30.610324],[111.369218,30.609469],[111.369982,30.608614],[111.370746,30.607758],[111.37151,30.606902],[111.372272,30.606046],[111.373034,30.605189],[111.373795,30.604332],[111.374556,30.603474],[111.375316,30.602617],[111.37608,30.601761],[111.376852,30.600911],[111.377635,30.600068],[111.378427,30.599232],[111.379231,30.598403],[111.380044,30.597582],[111.380868,30.596769],[111.381704,30.595965],[111.382548,30.595167],[111.383381,30.594361],[111.384184,30.593532],[111.384938,30.592671],[111.385646,30.591779],[111.386329,30.590875],[111.387017,30.589973],[111.387729,30.589085],[111.388467,30.588212],[111.389208,30.587342],[111.389927,30.586458],[111.390598,30.585547],[111.391215,30.584607],[111.391792,30.58365],[111.392355,30.582685],[111.39293,30.581726],[111.393527,30.580777],[111.394148,30.57984],[111.394779,30.578906],[111.395401,30.57797],[111.395998,30.577021],[111.396548,30.576052],[111.397032,30.575056],[111.397435,30.574034],[111.397765,30.572993],[111.39805,30.571941],[111.398331,30.57089],[111.398641,30.569844],[111.398982,30.568806],[111.399327,30.567768],[111.399629,30.566721],[111.399849,30.565657],[111.399971,30.564583],[111.400011,30.563505],[111.400007,30.562425],[111.399995,30.561346],[111.400004,30.560266],[111.400057,30.559189],[111.400166,30.558113],[111.400332,30.557043],[111.400554,30.555981],[111.400825,30.554927],[111.40114,30.553882],[111.401489,30.552845],[111.401865,30.551815],[111.402262,30.550791],[111.402672,30.549771],[111.403094,30.548755],[111.403525,30.54774],[111.40396,30.546728],[111.404401,30.545718],[111.404847,30.544708],[111.405295,30.5437],[111.405748,30.542694],[111.406203,30.541687],[111.406661,30.540682],[111.407122,30.539678],[111.407584,30.538674],[111.408049,30.537672],[111.408517,30.536671],[111.408987,30.535669],[111.40946,30.534669],[111.409933,30.533669],[111.410409,30.53267],[111.410887,30.531672],[111.411367,30.530674],[111.411849,30.529677],[111.412332,30.528681],[111.412818,30.527686],[111.413306,30.526691],[111.413796,30.525697],[111.414287,30.524704],[111.414781,30.523711],[111.415276,30.522719],[111.415775,30.521728],[111.416274,30.520738],[111.416776,30.519748],[111.417281,30.51876],[111.417788,30.517771],[111.418298,30.516785],[111.418809,30.5158],[111.419324,30.514815],[111.419843,30.513831],[111.420365,30.512849],[111.42089,30.511868],[111.42142,30.51089],[111.421954,30.509913],[111.422494,30.508938],[111.423039,30.507966],[111.423593,30.506997],[111.424156,30.506032],[111.424729,30.505071],[111.425315,30.504116],[111.425915,30.503169],[111.426534,30.502229],[111.427171,30.501298],[111.427831,30.50038],[111.428517,30.499475],[111.429228,30.498586],[111.429969,30.497715],[111.430738,30.496862],[111.431536,30.49603],[111.432361,30.495216],[111.433209,30.494421],[111.434076,30.493641],[111.434957,30.492872],[111.435845,30.492109],[111.436737,30.49135]];                 // [[lon,lat], ...] 688 点，来自 DEM 谷底校正航线

  /* ---------- 1. 局部坐标 + 弧长参数化 ---------- */
  const P = [];
  for (let i = 0; i < LL.length; i++) { const p = toLocal(LL[i][0], LL[i][1]); P.push([p.x, p.z]); }
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const TOTAL = S[S.length - 1];
  const N = P.length;

  function at(s) {
    s = clamp(s, 0, TOTAL);
    let lo = 0, hi = N - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
    const dx = P[hi][0] - P[lo][0], dz = P[hi][1] - P[lo][1];
    const n = Math.hypot(dx, dz) || 1;
    return { x: P[lo][0] + dx * t, z: P[lo][1] + dz * t, tx: dx / n, tz: dz / n, i: lo, t: t };
  }
  /* 曲线（曲率 → 压坡角） */
  function curvature(s) {
    const d = 150, a = at(s - d), b = at(s), c = at(s + d);
    const v1x = b.x - a.x, v1z = b.z - a.z, v2x = c.x - b.x, v2z = c.z - b.z;
    const cr = (v1x * v2z - v1z * v2x) / ((Math.hypot(v1x, v1z) * Math.hypot(v2x, v2z)) || 1);
    return Math.asin(clamp(cr, -1, 1)) / d;      // 弧度/米，左正右负
  }

  /* ---------- 2. 沿程地形 / 谷底 / 高度剖面（场景米，含 exag） ---------- */
  let TERR = null, FLOOR = null, Y = null;
  const CFG = {
    speed: 186, speedSlow: 122, speedRush: 228,    // 巡航 / 地标处 / 开阔段（m/s）
    lookAhead: 300, fov: 62, fovFocus: 52, fovRush: 80,
    clear: 150, low: 76,
    diveFrom: 1150, diveEnd: 4300,                 // 开场俯冲（约 25 s 落到江面）
    endSlowKm: 78, endSpeed: 70,                   // 末段减速
    rollMax: 0.22, sway: 1.0, smoothLook: 2.4,     // 平滑系数（越大越跟手）
    hud: true, brand: "宜昌 3D · yichang-3d",
    lmWindow: 1700, followLandmarks: true, speedLines: false, haze: 0.10,
  };
  const st = {
    on: false, s: 0, v: CFG.speed, t: 0, fovNow: CFG.fov, rollNow: 0,
    shakeT: 0, lastLm: null, lmBlend: 0, cardA: 0, cardLm: null, cardT: 0,
  };

  function buildProfile() {
    if (TERR) return;
    const e = (ter && ter.exag) ? ter.exag : 1;
    TERR = new Float32Array(N); FLOOR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const h = ter.sampleHeight(P[i][0], P[i][1]);
      TERR[i] = (h === null ? 0 : h) * e;
    }
    const step = TOTAL / (N - 1);
    for (let i = 0; i < N; i++) {
      const a = at(S[i]), nx = -a.tz, nz = a.tx;
      let mn = Infinity;
      for (let d = -520; d <= 520; d += 40) {
        const h = ter.sampleHeight(a.x + nx * d, a.z + nz * d);
        if (h !== null) mn = Math.min(mn, h * e);
      }
      FLOOR[i] = (mn === Infinity ? TERR[i] : mn);
    }
    const sm = (arr, winM) => {
      const w = Math.max(1, Math.round(winM / step));
      const o = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        let s = 0, c = 0;
        for (let k = -w; k <= w; k++) { const j = Math.min(arr.length - 1, Math.max(0, i + k)); s += arr[j]; c++; }
        o[i] = s / c;
      }
      return o;
    };
    TERR = sm(TERR, 260); FLOOR = sm(FLOOR, 620);
    /* 计划高度：离谷底 low 与 离地形 clear 取大；开场俯冲 */
    Y = new Float32Array(N);
    for (let i = 0; i < N; i++) Y[i] = Math.max(TERR[i] + CFG.clear, FLOOR[i] + CFG.low);
    for (let i = 0; i < N; i++) {
      const s = S[i];
      const ramp = s < CFG.diveEnd ? Math.pow(1 - s / CFG.diveEnd, 1.35) : 0;
      Y[i] += (CFG.diveFrom - Y[i]) * ramp;
    }
    Y = sm(Y, 420);
  }
  function sampleY(s) {
    if (!Y) return 0;
    const a = at(s), i = a.i, j = Math.min(N - 1, i + 1);
    return Y[i] + (Y[j] - Y[i]) * a.t;
  }

  /* ---------- 3. 地标事件（沿程里程） ---------- */
  let EVENTS = null;
  function buildEvents() {
    if (EVENTS) return;
    EVENTS = [];
    for (const L of (typeof LANDMARKS !== "undefined" ? LANDMARKS : [])) {
      const p = toLocal(L.lon, L.lat);
      let bi = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = (P[i][0] - p.x) ** 2 + (P[i][1] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      if (Math.sqrt(bd) > 8000) continue;      // 离航线太远（车溪/宜昌北站等）不做沿途镜头
      const h = ter.sampleHeight(p.x, p.z);
      EVENTS.push({
        L: L, x: p.x, z: p.z, s: S[bi], off: Math.sqrt(bd),
        y: ((h === null ? (L.a || 60) : h) * ((ter && ter.exag) ? ter.exag : 1)) + 40,
        spec: shotSpec(L, Math.sqrt(bd)),
      });
    }
    EVENTS.sort((a, b) => a.s - b.s);
    /* 去重：相邻 2.8 km 内只留一个（优先级 = 重要度 + 离航线距离惩罚）→ 同一段画面只有一个主题 */
    const kept = [];
    const prio = function (e) { return (e.L.big ? 300000 : 0) + ((e.L.fly || 0) * 40) - e.off * 8; };
    for (const e of EVENTS) {
      const last = kept[kept.length - 1];
      if (!last || (e.s - last.s) >= 2800) kept.push(e);
      else if (prio(e) > prio(last)) kept[kept.length - 1] = e;
    }
    EVENTS = kept;
  }

  /* ---------- 4. 主循环：把相机挂到航线上 ---------- */
  CFG.speed0 = CFG.speed; CFG.speedRush0 = CFG.speedRush; CFG.speedSlow0 = CFG.speedSlow;
  const _pos = new THREE.Vector3(), _look = new THREE.Vector3(), _tmp = new THREE.Vector3();
  /* 地标镜头规格：大地标拉更高、更慢、视场角更聚焦 */
  function shotSpec(L, off) {
    const big = !!L.big || (L.fly || 0) > 6000;
    const base = { rise: big ? 520 : 215, slow: big ? 0.74 : 0.86, fov: big ? 56 : 60,
                   pre: big ? 4200 : 2200, post: big ? 1500 : 1000,
                   lookMax: big ? 0.62 : 0.70, maxDown: big ? 0.62 : 0.70, maxYaw: 0.66 };
    /* maxYaw 是"相对航线方向允许的最大转头角"。侧方地标（如三峡机场离航线 7.5km）
       方位几乎垂直于航线（~87°），上限给小了就永远转不过去 —— 手机竖屏尤其明显。
       用 tanh 软限位，所以放大上限也不会产生跳变。 */
    base.lead = clamp(off * 1.2, base.pre * 0.45, 5200);   // 侧方地标提前看：方位角还小时就转头
    if (off <= 3000) return Object.assign({}, base, { lookMax: 1.0, maxYaw: 1.10,   // 贴身：完全正对
                                                     rise: Math.max(base.rise, 300) });
    if (off <= 6000) return Object.assign({}, base, {   // 中距：也爬升看全，稍收窄 FOV
      rise: Math.max(base.rise * 0.85, 340), slow: 0.92, lookMax: 1.0, maxYaw: 1.45, fov: 50,
      pre: base.pre * 0.80, post: base.post * 0.80 });
    return Object.assign({}, base, {                    // 远距：照样爬升 + 转头到几乎正对 + 长焦
      rise: Math.max(base.rise * 0.70, 360), slow: 0.90, lookMax: 1.0, maxYaw: 1.65, fov: 42,
      pre: base.pre * 0.60, post: base.post * 0.60 });
  }

  function packEv(e, s) {
    const sp = e.spec, d = e.s - s;
    const lead = sp.lead || (sp.pre * 0.45);
    /* 爬升峰值与视线峰值对齐（否则"先转头、后爬升"，看向地标时还在低空） */
    const rise0 = e.s - Math.max(sp.pre, lead * 1.5);
    const sPk = e.s - lead * 0.85;
    const a = clamp((s - rise0) / Math.max(1, sPk - rise0), 0, 1);
    const b = 1 - clamp((s - sPk) / (sp.post + Math.max(sp.pre * 0.32, lead * 0.6)), 0, 1);
    return { e: e, w: Math.min(a, b), d: d, sp: sp, lead: lead,
             wLook: clamp(1 - Math.abs((s - (e.s - lead)) / (lead * 0.9)), 0, 1) };
  }
  function shotAt(s) {                       // 当前生效的地标镜头
    if (!EVENTS) return null;
    /* 粘滞：正在展示的这条没播完之前不换主题 */
    if (st.cardLm) {
      const cur = EVENTS.filter(function (e) { return e.L === st.cardLm; })[0];
      if (cur) {
        const p = packEv(cur, s);
        if (p.d > -cur.spec.post * 0.92 && p.d < Math.max(cur.spec.pre, (cur.spec.lead || 0) * 1.2)) return p;
      }
    }
    let best = null, bs = 0;
    for (const e of EVENTS) {
      const d = e.s - s;
      const preEff = Math.max(e.spec.pre, (e.spec.lead || 0) * 1.15);
      if (d > preEff || d < -e.spec.post) continue;
      const p = packEv(e, s);
      const sc = Math.max(p.w, p.wLook * 0.95);
      if (sc > bs) { bs = sc; best = p; }
    }
    return best;
  }

  const _lookS = new THREE.Vector3(), _proj = new THREE.Vector3();
  function tick(dt) {
    if (!st.on) return;
    buildProfile(); buildEvents();
    dt = Math.min(Math.max(dt, 0.0005), 0.08);
    st.t += dt;

    const shot = shotAt(st.s);

    /* ── 速度：默认快，地标处慢，末端收尾更慢 ── */
    const k = Math.abs(curvature(st.s));
    let vT = CFG.speed + (CFG.speedRush - CFG.speed) * clamp((st.s / TOTAL - 0.22) * 1.5, 0, 1);
    vT -= clamp(k * 1700, 0, 26);
    if (shot) vT *= (1 - (1 - shot.sp.slow) * clamp(shot.w * 1.1 + shot.wLook * 0.5, 0, 1));
    const kmNow = st.s / 1000;
    if (kmNow > CFG.endSlowKm) {
      const t = clamp((kmNow - CFG.endSlowKm) / (TOTAL / 1000 - CFG.endSlowKm), 0, 1);
      vT = Math.min(vT, lerp(CFG.speedSlow, CFG.endSpeed, t));
    }
    st.v += clamp(vT - st.v, -52 * dt, 26 * dt);
    st.s += st.v * dt;
    if (st.s > TOTAL - 2) {
      st.s = TOTAL - 2;
      st.holdT = (st.holdT || 0) + dt;
      if (st.holdT > 5) { st.holdT = 0; IDLE.auto = false; FPV.stop(); }   // 飞完全程，收尾后交还地图
    } else st.holdT = 0;

    /* ── 位置：航线 + 地标处抬升 ── */
    const a = at(st.s), ah = at(st.s + CFG.lookAhead);
    const rise = shot ? shot.sp.rise * shot.w : 0;
    const y = sampleY(st.s) + rise;
    _pos.set(a.x, y, a.z);
    _look.set(ah.x, sampleY(st.s + CFG.lookAhead) + rise * 0.5, ah.z);

    /* ── 地标追踪：视线拉向地标（带俯角限制），信息卡同步 ── */
    if (CFG.followLandmarks && shot && shot.wLook > 0.02) {
      st.lmBlend += (shot.wLook * 0.95 - st.lmBlend) * Math.min(1, dt * 1.9);
      st.lmBlend = Math.min(st.lmBlend, shot.sp.lookMax);
      _tmp.set(shot.e.x, shot.e.y, shot.e.z);
      const lookDist = Math.hypot(_tmp.x - _pos.x, _tmp.z - _pos.z) || 1;
      if ((_pos.y - _tmp.y) / lookDist > shot.sp.maxDown) _tmp.y = _pos.y - lookDist * shot.sp.maxDown;
      _look.lerp(_tmp, st.lmBlend);
      /* 水平/俯角都用 tanh 软限位：连续、无阈值跳变（硬 clamp 会让视角一卡一卡） */
      const lx = _look.x - _pos.x, ly = _look.y - _pos.y, lz = _look.z - _pos.z;
      const hl = Math.hypot(lx, lz) || 1;
      const yawPath = Math.atan2(a.tx, a.tz);
      let dyaw = Math.atan2(lx, lz) - yawPath;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));          // 归一到 ±π
      const maxY = shot.sp.maxYaw;
      const newYaw = yawPath + maxY * Math.tanh(dyaw / maxY);
      _look.x = _pos.x + Math.sin(newYaw) * hl;
      _look.z = _pos.z + Math.cos(newYaw) * hl;
      const pitch = Math.atan2(-ly, hl), maxP = (shot.sp.maxDown || 0.62) * 1.15;
      _look.y = _pos.y - Math.tan(maxP * Math.tanh(pitch / maxP)) * hl;
    } else {
      st.lmBlend += (0 - st.lmBlend) * Math.min(1, dt * 1.9);
    }
    const cardOn = !!(shot && shot.d > -shot.sp.post * 0.85 && shot.d < Math.max(shot.sp.pre * 0.62, (shot.sp.lead || 0) * 1.1));
    if (cardOn) st.cardLm = shot.e;
    st.cardA += ((cardOn ? 1 : 0) - st.cardA) * Math.min(1, dt * 2.2);
    if (!cardOn && st.cardA <= 0.02) { st.cardA = 0; st.cardLm = null; }

    /* ── FOV：地标处收窄聚焦，加速时张开 ── */
    let fT = CFG.fov + (CFG.fovRush - CFG.fov) * clamp((st.v - 150) / 70, 0, 1);
    /* 竖屏补偿：16:9 时水平视野约 ±31°，竖屏只有 ±15° —— 按纵横比放大巡航 FOV，
       否则地标即使"转过去"也在画面外（手机预览"转不够"的根因） */
    const _asp = (window.innerWidth || 1280) / Math.max(1, window.innerHeight || 720);
    if (_asp < 1) fT = fT * clamp(0.62 / _asp, 1, 1.30);
    /* 地标聚焦：长焦把远处地标拉近（竖屏补偿不作用于它，避免把长焦又推回去） */
    if (shot) {
      /* 用"已平滑过的追踪强度"驱动聚焦，保证"转过去"和"拉近"同时到达（否则长焦错过最佳时刻） */
      const fw = Math.max(shot.wLook, st.lmBlend / Math.max(0.05, shot.sp.lookMax));
      fT = fT + (shot.sp.fov - fT) * clamp(fw * 1.15, 0, 1);
    }
    st.fovNow += (fT - st.fovNow) * Math.min(1, dt * (shot ? 2.8 : 1.3));   // 地标聚焦时反应更快

    /* ── 压坡（转弯） ── */
    const rollT = clamp(-Math.atan(st.v * st.v * curvature(st.s + 70) / 9.8) * 0.26, -CFG.rollMax, CFG.rollMax);
    st.rollNow += (rollT - st.rollNow) * Math.min(1, dt * 1.0);

    /* ── 相机：位置 + 平滑视线 + 低频手持晃动 ── */
    camera.position.set(_pos.x, _pos.y, _pos.z);
    camera.up.set(0, 1, 0);
    if (!st.lookInit) { _lookS.copy(_look); st.lookInit = true; }
    _lookS.lerp(_look, Math.min(1, dt * CFG.smoothLook));
    camera.lookAt(_lookS);
    camera.rotateZ(st.rollNow);
    const w1 = Math.sin(st.t * 2.10) * 0.55 + Math.sin(st.t * 1.37 + 1.7) * 0.45;
    const w2 = Math.sin(st.t * 1.63 + 0.6) * 0.60 + Math.sin(st.t * 2.71 + 2.3) * 0.40;
    const w3 = Math.sin(st.t * 0.83 + 2.9) * 0.5 + Math.sin(st.t * 1.19 + 0.4) * 0.5;
    const amp = (0.0014 + 0.0034 * clamp(st.v / 200, 0, 1)) * CFG.sway;
    camera.rotateY(w1 * amp);
    camera.rotateX(w2 * amp * 0.75);
    camera.rotateZ(w3 * amp * 0.5);
    camera.fov = st.fovNow;
    camera.near = 3;
    camera.updateProjectionMatrix();
    if (typeof sky !== "undefined" && sky) {
      sky.position.copy(camera.position);
      if (CFG.haze !== undefined && sky.material && sky.material.uniforms && sky.material.uniforms.uHaze)
        sky.material.uniforms.uHaze.value = CFG.haze;
    }
  }

  /* ---------- 5. HUD（画在 2D canvas 上，作为 WebGL 叠加层，离屏出图也带 UI） ---------- */
  const UI = { cv: document.createElement("canvas"), tex: null, scene: null, cam: null, quad: null };
  function initUI() {
    if (UI.tex) return;
    UI.cv.width = 1920; UI.cv.height = 1080;
    UI.tex = new THREE.CanvasTexture(UI.cv);
    UI.tex.colorSpace = THREE.SRGBColorSpace;
    UI.scene = new THREE.Scene();
    UI.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    UI.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: UI.tex, transparent: true, depthTest: false, depthWrite: false }));
    UI.scene.add(UI.quad);
  }
  function f2(v) { return v.toFixed(2); }
  function drawHud(W, H) {
    if (!CFG.hud) return;
    initUI();
    const g = UI.cv.getContext("2d");
    const K = UI.cv.width / 1920;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, UI.cv.width, UI.cv.height);
    g.scale(K, K);
    const F = (s, w) => (w || 600) + " " + s + "px -apple-system,\"PingFang SC\",Helvetica,Arial,sans-serif";
    g.textBaseline = "alphabetic";

    /* 暗角 + 速度线（速度感） */
    const vg = g.createRadialGradient(960, 540, 460, 960, 540, 1120);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.42)");
    g.fillStyle = vg; g.fillRect(0, 0, 1920, 1080);
    const sg = g.createLinearGradient(0, 0, 0, 200);
    sg.addColorStop(0, "rgba(0,0,0,.46)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg; g.fillRect(0, 0, 1920, 200);
    const sg2 = g.createLinearGradient(0, 1080, 0, 860);
    sg2.addColorStop(0, "rgba(0,0,0,.58)"); sg2.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg2; g.fillRect(0, 860, 1920, 220);
    if (CFG.speedLines) {
      const sp = clamp((st.v - 120) / 90, 0, 1);
      if (sp > 0.01) {
        g.save(); g.translate(960, 540);
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2 + st.t * 0.35;
          const r0 = 620 + ((i * 37) % 200), r1 = r0 + 210 + sp * 340;
          g.strokeStyle = "rgba(255,255,255," + (0.05 + 0.12 * sp) * (0.4 + 0.6 * Math.abs(Math.sin(i * 2.1 + st.t * 3))) + ")";
          g.lineWidth = 2 + 3 * sp;
          g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
        }
        g.restore();
      }
    }

    /* 左上：品牌 */
    g.font = F(26, 600); g.fillStyle = "rgba(232,238,246,.72)";
    g.fillText(CFG.brand, 56, 78);
    g.font = F(20, 400); g.fillStyle = "rgba(143,162,184,.85)";
    g.fillText("长江航线 · " + f2(TOTAL / 1000) + " km", 56, 110);

    /* 左下：速度块 */
    const kmh = Math.round(st.v * 3.6);
    g.font = F(92, 700); g.fillStyle = "#ffffff";
    g.fillText(String(kmh), 56, 950);
    g.font = F(26, 500); g.fillStyle = "rgba(143,162,184,.95)";
    g.fillText("km/h", 60 + g.measureText(String(kmh)).width * 0 + 205, 950);
    const camY = camera.position.y, agl = camY - TERR[at(st.s).i];
    g.font = F(24, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText("海拔 " + Math.round(camY) + " m　离地 " + Math.round(agl) + " m", 56, 992);
    /* 速度条 */
    g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(56, 1012, 300, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(56, 1012, 300 * clamp(st.v / 220, 0, 1), 6);

    /* 右上：航向 + 航迹 */
    const a = at(st.s);
    const hdg = (Math.atan2(a.tx, -a.tz) * 180 / Math.PI + 360) % 360;
    g.font = F(34, 600); g.fillStyle = "#e8eef6"; g.textAlign = "right";
    g.fillText(String(Math.round(hdg)).padStart(3, "0") + "°", 1864, 92);
    g.font = F(20, 400); g.fillStyle = "rgba(143,162,184,.9)";
    g.fillText("航向", 1864, 120);
    g.textAlign = "left";

    /* 底部：进度条 + 地标刻度 */
    const bx = 160, bw = 1600, by = 1042;
    g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(bx, by, bw, 6);
    g.fillStyle = "#4fc3f7"; g.fillRect(bx, by, bw * clamp(st.s / TOTAL, 0, 1), 6);
    if (EVENTS) for (const e of EVENTS) {
      const x = bx + bw * clamp(e.s / TOTAL, 0, 1);
      g.fillStyle = (Math.abs(e.s - st.s) < 1500) ? "#ffd166" : "rgba(255,209,102,.55)";
      g.beginPath(); g.arc(x, by + 3, 4.5, 0, 7); g.fill();
    }
    g.font = F(20, 500); g.fillStyle = "rgba(200,214,230,.9)";
    g.fillText(f2(st.s / 1000) + " / " + f2(TOTAL / 1000) + " km", bx, by - 14);
    const nx = nextEvent();
    if (nx) {
      g.textAlign = "right"; g.fillStyle = "rgba(255,209,102,.95)";
      g.fillText("下一地标 " + nx.L.n + "　" + f2((nx.s - st.s) / 1000) + " km", bx + bw, by - 14);
      g.textAlign = "left";
    }

    /* 地标信息卡 */
    if (st.cardLm && st.cardA > 0.01) {
      const L = st.cardLm.L, al = clamp(st.cardA, 0, 1);
      const px = 1180, py = 250, pw = 660, ph = 300;
      g.save(); g.globalAlpha = al;
      g.fillStyle = "rgba(10,17,26,.80)";
      g.strokeStyle = "rgba(79,195,247,.65)"; g.lineWidth = 2;
      roundRect(g, px, py, pw, ph, 16); g.fill(); g.stroke();
      /* 左侧色条 */
      g.fillStyle = "#4fc3f7"; g.fillRect(px, py + 26, 5, ph - 52);
      g.font = F(46, 700); g.fillStyle = "#ffffff";
      g.fillText(L.n, px + 36, py + 78);
      g.font = F(22, 500); g.fillStyle = "#9fdcff";
      g.fillText((L.k || "") + "　海拔 " + (L.a || "-") + " m　距航线 " + Math.round(st.cardLm.off) + " m", px + 38, py + 118);
      g.font = F(24, 400); g.fillStyle = "rgba(214,226,240,.92)";
      wrap(g, L.d || "", px + 38, py + 164, pw - 76, 34, 4);
      g.restore();
      /* 屏幕上的地标指示（自己按相机投影算，锁死地标；出画时给边缘箭头） */
      _proj.set(st.cardLm.x, st.cardLm.y, st.cardLm.z).project(camera);
      const behind = (_proj.z > 1);
      const sx = (_proj.x * 0.5 + 0.5) * 1920, sy = (-_proj.y * 0.5 + 0.5) * 1080;
      const onScreen = !behind && sx > 40 && sx < 1880 && sy > 40 && sy < 1040;
      g.save(); g.globalAlpha = al;
      if (onScreen) {
        g.strokeStyle = "#ffd166"; g.lineWidth = 3;
        g.beginPath(); g.arc(sx, sy, 16, 0, 7); g.stroke();
        g.beginPath();
        g.moveTo(sx - 26, sy); g.lineTo(sx - 8, sy);
        g.moveTo(sx + 8, sy); g.lineTo(sx + 26, sy);
        g.moveTo(sx, sy - 26); g.lineTo(sx, sy - 8);
        g.moveTo(sx, sy + 8); g.lineTo(sx, sy + 26);
        g.stroke();
      } else {
        const cx = 960, cy = 540;
        let dx = sx - cx, dy = sy - cy;
        const LL = Math.hypot(dx, dy) || 1;
        dx /= LL; dy /= LL;
        const ex = cx + dx * 880, ey = cy + dy * 470;
        g.translate(ex, ey); g.rotate(Math.atan2(dy, dx) + Math.PI / 2);
        g.fillStyle = "#ffd166";
        g.beginPath(); g.moveTo(0, -20); g.lineTo(15, 14); g.lineTo(0, 6); g.lineTo(-15, 14); g.closePath(); g.fill();
      }
      g.restore();
    }
    UI.tex.needsUpdate = true;
  }
  function nextEvent() {
    if (!EVENTS) return null;
    for (const e of EVENTS) if (e.s > st.s + 120) return e;
    return null;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function wrap(g, text, x, y, maxW, lh, maxLines) {
    const chars = String(text).split("");
    let line = "", n = 0;
    for (const ch of chars) {
      if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, y); y += lh; n++; line = ch; if (n >= maxLines - 1) break; }
      else line += ch;
    }
    if (line) g.fillText(line, x, y);
  }

  /* ---------- 6. 离屏出帧（含 HUD）+ 上传 ---------- */
  const RB = { rt: null, w: 0, h: 0, buf: null, cv: null, cx: null, id: null };
  function getRT(W, H) {
    if (RB.rt && RB.w === W && RB.h === H) return RB.rt;
    if (RB.rt) RB.rt.dispose();
    RB.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.NoColorSpace });
    RB.w = W; RB.h = H; RB.buf = new Uint8Array(W * H * 4);
    RB.cv = document.createElement("canvas"); RB.cv.width = W; RB.cv.height = H;
    RB.cx = RB.cv.getContext("2d"); RB.id = RB.cx.createImageData(W, H);
    return RB.rt;
  }
  window.fpvSnap = async function (W, H, label) {
    const rt = getRT(W, H);
    const asp = camera.aspect, onear = camera.near;
    camera.aspect = W / H; camera.near = 3; camera.updateProjectionMatrix();
    drawHud(W, H);
    if (sky) sky.position.copy(camera.position);
    renderer.setRenderTarget(rt);
    renderer.autoClear = true; renderer.render(scene, camera);
    if (CFG.hud && UI.scene) { renderer.autoClear = false; renderer.render(UI.scene, UI.cam); renderer.autoClear = true; }
    const buf = RB.buf;
    try { renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); } catch (e) { }
    renderer.setRenderTarget(null);
    camera.aspect = asp; camera.near = onear; camera.updateProjectionMatrix();
    for (let y = 0; y < H; y++) RB.id.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    RB.cx.putImageData(RB.id, 0, 0);
    const blob = await new Promise(r => RB.cv.toBlob(r, "image/jpeg", 0.92));
    let ok = "no-server";
    try { const r = await fetch("/__snap?name=" + encodeURIComponent(label || "fpv"), { method: "POST", body: blob }); ok = r.ok ? "ok" : ("HTTP " + r.status); }
    catch (e) { ok = "err " + e.message; }
    return ok;
  };

  /* ---------- 7. 连续录制（分段，边录边上传） ---------- */
  window.fpvRecord = async function (o) {
    o = o || {};
    const fps = o.fps || 30, secs = o.secs || 8, W = o.W || 1280, H = o.H || 720;
    const from = (o.fromKm !== undefined) ? o.fromKm * 1000 : st.s;
    const pre = o.prefix || "f";
    st.s = clamp(from, 0, TOTAL - 1);
    st.v = CFG.speed;
    const n = Math.round(fps * secs);
    window.__rec = { i: 0, n: n, done: false, last: "" };
    for (let i = 0; i < n; i++) {
      tick(1 / fps);
      const name = pre + "_" + String(i).padStart(5, "0") + ".jpg";
      window.__rec.last = await window.fpvSnap(W, H, name);
      window.__rec.i = i + 1;
      if (o.onFrame) o.onFrame(i);
    }
    window.__rec.done = true;
    return "recorded " + n + " frames @" + W + "x" + H;
  };

  /* ---------- 8. 对外 ---------- */
  function jumpTo(dir) {
    buildProfile(); buildEvents();
    if (!EVENTS || !EVENTS.length) return "no-events";
    let target = null;
    if (dir > 0) {
      /* 找"展示窗口还没开始"的下一个地标；若已在该窗口内，则跳到再下一个 */
      for (const e of EVENTS) { if (e.s - e.spec.pre * 0.55 > st.s + 250) { target = e; break; } }
      if (!target) { st.s = TOTAL - 2; return "末尾"; }
    }
    else { for (let i = EVENTS.length - 1; i >= 0; i--) { if (EVENTS[i].s < st.s - 700) { target = EVENTS[i]; break; } } if (!target) target = EVENTS[0]; }
    if (!target) { st.s = TOTAL - 2; return "末尾"; }
    st.s = clamp(target.s - target.spec.pre * 0.55, 0, TOTAL - 2);
    st.v = Math.max(st.v, CFG.speed * 0.85);
    st.cardA = 0; st.cardLm = null; st.lmBlend = 0; st.lookInit = false; st.holdT = 0;
    return (dir > 0 ? "→ " : "← ") + target.L.n + " @" + (st.s / 1000).toFixed(1) + " km";
  }

  const FPV = {
    CFG: CFG, st: st, TOTAL: TOTAL, P: P, S: S, events: () => EVENTS,
    get on() { return st.on; },
    start(cfg) {
      if (cfg && cfg.auto) { IDLE.auto = true; cfg = Object.assign({}, cfg); delete cfg.auto; } else { IDLE.auto = false; }
      Object.assign(CFG, cfg || {});
      TERR = FLOOR = Y = EVENTS = null;
      buildProfile(); buildEvents();
      st.on = true; st.s = 0; st.v = CFG.speed; st.t = 0; st.cardLm = null; st.cardA = 0;
      if (typeof flight !== "undefined" && flight) flight.active = false;
      return "FPV start: " + (TOTAL / 1000).toFixed(2) + " km, " + EVENTS.length + " 地标";
    },
    stop() { st.on = false; st.holdT = 0; IDLE.auto = false; resetIdle(); if (typeof buildUI === "function") buildUI(); return "FPV stop"; },
    seek(km) { st.s = clamp(km * 1000, 0, TOTAL - 1); st.cardA = 0; st.cardLm = null; st.lookInit = false; return "seek " + km + " km"; },
    /* 跳到下一个 / 上一个航点（直接进入该地标的展示窗口） */
    next() { return jumpTo(1); },
    prev() { return jumpTo(-1); },
    tick: tick,
    info() {
      const a = at(st.s);
      return { km: st.s / 1000, total: TOTAL / 1000, v: st.v, y: sampleY(st.s), terr: TERR[a.i],
               fov: st.fovNow, roll: st.rollNow, card: st.cardLm ? st.cardLm.L.n : null, hud: CFG.hud };
    },
    /* 录制前的画质设置 */
    setup(o) {
      o = o || {};
      const q = document.querySelector('#qual button[data-q="1024"]'); if (q && !q.classList.contains("on")) q.click();
      const fog = document.getElementById('s-fog');
      if (fog) { fog.value = (o.fog !== undefined ? o.fog : 8); fog.dispatchEvent(new Event('input')); }
      const mist = document.getElementById('t-mist');
      if (mist && mist.checked !== !!o.mist) { mist.checked = !!o.mist; mist.dispatchEvent(new Event('change')); }
      const ctr = document.getElementById('t-contour');
      if (ctr && ctr.checked !== !!o.contour) { ctr.checked = !!o.contour; ctr.dispatchEvent(new Event('change')); }
      if (window.noAnim) window.noAnim();
      return "setup: q1024 fog" + (fog ? fog.value : "?") + " mist" + !!o.mist;
    },
    /* 高频调用：推进 + 出图 */
    async snapStep(dt, W, H, label) { tick(dt); return await window.fpvSnap(W, H, label); },
  };
  /* ---------- 9. 挂机自动巡航：闲置 N 秒 → 自动进入程序的「巡航」模式，把地标全部过一遍 ---------- */
  const IDLE = { sec: 120, on: true, t0: 0, auto: false, mode: "tour", lastIdx: -1, pass: 0 };
  function nowMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
  function resetIdle() { IDLE.t0 = nowMs(); }
  resetIdle();

  /* 打开/关闭程序自带的巡航模式（等价于点右侧 ✈ 按钮） */
  function tourOn() {
    if (typeof state === "undefined" || !state) return false;
    state.tour = true; state.tourT = 0; state.tourIdx = 0;
    if (typeof state.tourIdx !== "undefined") { }
    if (typeof stopAutoRot === "function") stopAutoRot();
    const b = document.getElementById("btn-tour"); if (b) b.classList.add("on");
    IDLE.lastIdx = -1; IDLE.pass = 0;
    return true;
  }
  function tourOff() {
    if (typeof state !== "undefined" && state) state.tour = false;
    const b = document.getElementById("btn-tour"); if (b) b.classList.remove("on");
    if (typeof window.toast === "function") { }
  }

  ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "touchmove", "click", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () {
      resetIdle();
      if (!IDLE.auto) return;
      if (ev === "pointerdown" || ev === "keydown" || ev === "touchstart") {
        if (IDLE.mode === "fpv" && st.on) { IDLE.auto = false; FPV.stop(); }
        else if (IDLE.mode === "tour" && typeof state !== "undefined" && state && state.tour) {
          IDLE.auto = false; tourOff();                 // 用户回来了 → 退出自动巡航
        }
      }
    }, { passive: true });
  });

  function idleCheck(force) {
    if (!IDLE.on) return "off";
    if (!force && document.visibilityState === "hidden") return "hidden";
    if (typeof state !== "undefined" && state && state.ready === false) return "loading";
    /* 自动巡航进行中：数够一圈地标就收尾 */
    if (IDLE.auto) {
      if (IDLE.mode === "tour" && state.tour) {
        if (state.tourIdx !== IDLE.lastIdx) { IDLE.lastIdx = state.tourIdx; IDLE.pass++; }
        const total = (typeof LANDMARKS !== "undefined" ? LANDMARKS.length : 20);
        if (IDLE.pass >= total) { IDLE.auto = false; tourOff(); resetIdle(); return "finished"; }
        return "touring " + IDLE.pass + "/" + total;
      }
      if (IDLE.mode === "fpv" && st.on) return "flying";
      IDLE.auto = false;
      return "done";
    }
    /* 已在巡航或 FPV 中，不重复触发 */
    if (st.on || (typeof state !== "undefined" && state && state.tour)) return "busy";
    if (nowMs() - IDLE.t0 >= IDLE.sec * 1000) {
      IDLE.auto = true;
      if (IDLE.mode === "fpv") { FPV.start({ auto: true }); return "started-fpv"; }
      if (tourOn()) return "started-tour";
      IDLE.auto = false;
      return "fail";
    }
    return "wait";
  }
  setInterval(idleCheck, 1000);
  FPV.idleCheck = idleCheck;
  FPV.setIdle = function (sec, on, mode) {
    if (sec !== undefined) IDLE.sec = Math.max(10, sec | 0);
    if (on !== undefined) IDLE.on = !!on;
    if (mode) IDLE.mode = mode;
    resetIdle();
    const c = document.getElementById("t-fpvidle"), r = document.getElementById("s-fpvidle"), v = document.getElementById("v-fpvidle");
    if (c) c.checked = IDLE.on;
    if (r) r.value = IDLE.sec;
    if (v) v.textContent = (IDLE.sec / 60).toFixed(1) + " 分";
    return "idle " + IDLE.sec + "s / " + (IDLE.on ? "on" : "off") + " / " + IDLE.mode;
  };
  FPV.idle = function () {
    return { sec: IDLE.sec, on: IDLE.on, auto: IDLE.auto, mode: IDLE.mode,
             tourOn: (typeof state !== "undefined" && state) ? !!state.tour : null,
             pass: IDLE.pass, left: Math.max(0, Math.round((IDLE.sec * 1000 - (nowMs() - IDLE.t0)) / 1000)) };
  };
  FPV.tour = function (v) { if (v) tourOn(); else tourOff(); return "tour " + (state && state.tour); };

  window.FPV = FPV;
})();
