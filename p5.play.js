/*
p5.play
por Paolo Pedercini/molleindustria, 2015
http://molleindustria.org/
*/

(function(root, factory) {
  if (typeof define === 'function' && define.amd)
  define('p5.play', ['@code-dot-org/p5'], function(p5) { (factory(p5)); });
  else if (typeof exports === 'object')
  factory(require('@code-dot-org/p5'));
  else
  factory(root.p5);
  }(this, function(p5) {
  /**
   * p5.play é uma biblioteca para p5.js para facilitar a criação de jogos e projetos
   * semelhantes.
   *
   * Ele fornece uma classe Sprite flexível para gerenciar objetos visuais em espaço 2D
   * e recursos como suporte de animação, detecção básica de colisão
   * e resolução, interações de mouse e teclado e uma câmera virtual.
   *
   * p5.play não é um mecanismo de física derivado de box2D, não usa eventos e é
   * programado para ser entendido e possivelmente modificado por programadores intermediários.
   *
   * Veja a pasta de exemplos para mais informações sobre como usar esta biblioteca.
   *
   * @module p5.play
   * @submodule p5.play
   * @for p5.play
   * @main
   */
  
  // =============================================================================
  //                         Inicialização
  // =============================================================================
  
  var DEFAULT_FRAME_RATE = 30;
  
  // Esta é a nova maneira de inicializar propriedades p5 personalizadas para qualquer instância p5.
  // O objetivo é migrar propriedades P5 preguiçosas para este método.
  // @see https://github.com/molleindustria/p5.play/issues/46
  p5.prototype.registerMethod('init', function p5PlayInit() {
    /**
     * A câmera de esboço é criada automaticamente no início de um esboço.
     * Uma câmera facilita a rolagem e o zoom para cenas que vão além
     * da tela. Uma câmera tem uma posição, um fator de zoom e as
     * coordenadas do mouse em relação à visualização.
     *
     * Em termos de p5.js, a câmera envolve todo o ciclo desenhado em uma
     * matriz de transformação, mas pode ser desativada a qualquer momento durante o ciclo de
     * desenho, por exemplo, para desenhar elementos de interface em uma posição absoluta.
     *
     * @property camera  @propriedade câmera
     * @type {camera}    @tipo {câmera}
     */
    this.camera = new Camera(this, 0, 0, 1);
    this.camera.init = false;
  
    this.angleMode(this.DEGREES);
    this.frameRate(DEFAULT_FRAME_RATE);
  
    this._defaultCanvasSize = {
      width: 400,
      height: 400
    };
  
    var startDate = new Date();
    this._startTime = startDate.getTime();
  
    // Tela temporária para suportar operações de tingimento de elementos de imagem;
    // ver p5.prototype.imageElement()
    this._tempCanvas = document.createElement('canvas');
  });
  
  // Isso fornece uma maneira de definirmos preguiçosamente propriedades que
  // são globais para instâncias p5.
  //
  // Observe que isso não é apenas uma otimização: atualmente, o p5 não oferece
  // nenhuma maneira de complementos serem notificados quando novas instâncias de p5 são criadas, então
  // criar essas propriedades devagar é o * único * mecanismo disponível
  // para nós. Para mais informação, ver:
  //
  // https://github.com/processing/p5.js/issues/1263
  function defineLazyP5Property(name, getter) {
    Object.defineProperty(p5.prototype, name, {
      configurable: true,
      enumerable: true,
      get: function() {
        var context = (this instanceof p5 && !this._isGlobal) ? this : window;
  
        if (typeof(context._p5PlayProperties) === 'undefined') {
          context._p5PlayProperties = {};
        }
        if (!(name in context._p5PlayProperties)) {
          context._p5PlayProperties[name] = getter.call(context);
        }
        return context._p5PlayProperties[name];
      }
    });
  }
  
  // Isso retorna uma função de fábrica, adequada para passar para
  // defineLazyP5Property, que retorna uma subclasse do dado
  // construtor que está sempre ligado a uma instância p5 particular.
  function boundConstructorFactory(constructor) {
    if (typeof(constructor) !== 'function')
      throw new Error('constructor must be a function');
  
    return function createBoundConstructor() {
      var pInst = this;
  
      function F() {
        var args = Array.prototype.slice.call(arguments);
  
        return constructor.apply(this, [pInst].concat(args));
      }
      F.prototype = constructor.prototype;
  
      return F;
    };
  }
  
  // Este é um utilitário que torna fácil definir apelidos convenientes para
  // métodos de instância p5 pré-ligados.
  //
  // Por exemplo:
  //
  //   var pInstBind = createPInstBinder(pInst);
  //
  //   var createVector = pInstBind('createVector');
  //   var loadImage = pInstBind('loadImage');
  //
  // O acima irá criar funções createVector e loadImage, que podem ser
  // usadas de forma semelhante ao modo global p5; no entanto, eles estão vinculados a instâncias p5
  // específicas e, portanto, podem ser usadas fora do modo global.
  function createPInstBinder(pInst) {
    return function pInstBind(methodName) {
      var method = pInst[methodName];
  
      if (typeof(method) !== 'function')
        throw new Error('"' + methodName + '" is not a p5 method');
      return method.bind(pInst);
    };
  }
  
  // Estas são funções utilitárias p5 que não dependem do estado da instância p5
  // para funcionar corretamente, então vamos prosseguir e torná-los fáceis de
  // acessar sem precisar vinculá-los a uma instância p5.
  var abs = p5.prototype.abs;
  var radians = p5.prototype.radians;
  var degrees = p5.prototype.degrees;
  
  // =============================================================================
  //                        substituições p5
  // =============================================================================
  
  // Torne a cor de preenchimento padrão para cinza (127, 127, 127) cada vez que uma nova tela for
  // criada.
  if (!p5.prototype.originalCreateCanvas_) {
    p5.prototype.originalCreateCanvas_ = p5.prototype.createCanvas;
    p5.prototype.createCanvas = function() {
      var result = this.originalCreateCanvas_.apply(this, arguments);
      this.fill(this.color(127, 127, 127));
      return result;
    };
  }
  
  // Tornar largura e altura opcionais para elipse() - padrão para 50
  // Salve a implementação original para permitir parâmetros opcionais.
  if (!p5.prototype.originalEllipse_) {
    p5.prototype.originalEllipse_ = p5.prototype.ellipse;
    p5.prototype.ellipse = function(x, y, w, h) {
      w = (w) ? w : 50;
      h = (w && !h) ? w : h;
      this.originalEllipse_(x, y, w, h);
    };
  }
  
  // Tornar largura e altura opcionais para rect() - padrão para 50
  // Salve a implementação original para permitir parâmetros opcionais.
  if (!p5.prototype.originalRect_) {
    p5.prototype.originalRect_ = p5.prototype.rect;
    p5.prototype.rect = function(x, y, w, h) {
      w = (w) ? w : 50;
      h = (w && !h) ? w : h;
      this.originalRect_(x, y, w, h);
    };
  }
  
  // Modifique p5 para ignorar posições fora dos limites antes de definir touchIsDown
  p5.prototype._ontouchstart = function(e) {
    if (!this._curElement) {
      return;
    }
    var validTouch;
    for (var i = 0; i < e.touches.length; i++) {
      validTouch = getTouchInfo(this._curElement.elt, e, i);
      if (validTouch) {
        break;
      }
    }
    if (!validTouch) {
      // Nenhum toque dentro dos limites (válido), retorne e ignore:
      return;
    }
    var context = this._isGlobal ? window : this;
    var executeDefault;
    this._updateNextTouchCoords(e);
    this._updateNextMouseCoords(e);
    this._setProperty('touchIsDown', true);
    if (typeof context.touchStarted === 'function') {
      executeDefault = context.touchStarted(e);
      if (executeDefault === false) {
        e.preventDefault();
      }
    } else if (typeof context.mousePressed === 'function') {
      executeDefault = context.mousePressed(e);
      if (executeDefault === false) {
        e.preventDefault();
      }
      //this._setMouseButton(e);
    }
  };
  
  // Modifique p5 para lidar com transformações CSS (dimensionar) e ignorar posições
  // fora dos limites antes de relatar as coordenadas de toque.
  //
  // NOTA: _updateNextTouchCoords() é quase idêntico, mas chama uma função modificada
  // getTouchInfo() abaixo que dimensiona a posição de toque com o espaço de jogo
  // e pode retornar indefinido
  p5.prototype._updateNextTouchCoords = function(e) {
    var x = this.touchX;
    var y = this.touchY;
    if (e.type === 'mousedown' || e.type === 'mousemove' ||
        e.type === 'mouseup' || !e.touches) {
      x = this.mouseX;
      y = this.mouseY;
    } else {
      if (this._curElement !== null) {
        var touchInfo = getTouchInfo(this._curElement.elt, e, 0);
        if (touchInfo) {
          x = touchInfo.x;
          y = touchInfo.y;
        }
  
        var touches = [];
        var touchIndex = 0;
        for (var i = 0; i < e.touches.length; i++) {
          // Apenas alguns toques são válidos - apenas insira toques válidos na
          // matriz para a propriedade `touches`.
          touchInfo = getTouchInfo(this._curElement.elt, e, i);
          if (touchInfo) {
            touches[touchIndex] = touchInfo;
            touchIndex++;
          }
        }
        this._setProperty('touches', touches);
      }
    }
    this._setProperty('touchX', x);
    this._setProperty('touchY', y);
    if (!this._hasTouchInteracted) {
      // Para o primeiro desenho, faça o anterior e o próximo iguais
      this._updateTouchCoords();
      this._setProperty('_hasTouchInteracted', true);
    }
  };
  
  // NOTA: retorna indefinido se a posição estiver fora do intervalo válido
  function getTouchInfo(canvas, e, i) {
    i = i || 0;
    var rect = canvas.getBoundingClientRect();
    var touch = e.touches[i] || e.changedTouches[i];
    var xPos = touch.clientX - rect.left;
    var yPos = touch.clientY - rect.top;
    if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
      return {
        x: Math.round(xPos * canvas.offsetWidth / rect.width),
        y: Math.round(yPos * canvas.offsetHeight / rect.height),
        id: touch.identifier
      };
    }
  }
  
  // Modifique p5 para ignorar as posições fora dos limites antes de definir mouseIsPressed
  // e isMousePressed
  p5.prototype._onmousedown = function(e) {
    if (!this._curElement) {
      return;
    }
    if (!getMousePos(this._curElement.elt, e)) {
      // Não dentro dos limites, retornar e ignorar:
      return;
    }
    var context = this._isGlobal ? window : this;
    var executeDefault;
    this._setProperty('isMousePressed', true);
    this._setProperty('mouseIsPressed', true);
    this._setMouseButton(e);
    this._updateNextMouseCoords(e);
    this._updateNextTouchCoords(e);
    if (typeof context.mousePressed === 'function') {
      executeDefault = context.mousePressed(e);
      if (executeDefault === false) {
        e.preventDefault();
      }
    } else if (typeof context.touchStarted === 'function') {
      executeDefault = context.touchStarted(e);
      if (executeDefault === false) {
        e.preventDefault();
      }
    }
  };
  
  // Modifique p5 para lidar com transformações CSS (dimensionar) e ignorar posições
  // fora dos limites antes de relatar as coordenadas do mouse
  //
  // NOTA: _updateNextMouseCoords() é quase idêntico, mas chama uma função modificada
  // getMousePos() abaixo que dimensiona a posição de toque com o espaço de jogo
  // e pode retornar indefinido
  p5.prototype._updateNextMouseCoords = function(e) {
    var x = this.mouseX;
    var y = this.mouseY;
    if (e.type === 'touchstart' || e.type === 'touchmove' ||
        e.type === 'touchend' || e.touches) {
      x = this.touchX;
      y = this.touchY;
    } else if (this._curElement !== null) {
      var mousePos = getMousePos(this._curElement.elt, e);
      if (mousePos) {
        x = mousePos.x;
        y = mousePos.y;
      }
    }
    this._setProperty('mouseX', x);
    this._setProperty('mouseY', y);
    this._setProperty('winMouseX', e.pageX);
    this._setProperty('winMouseY', e.pageY);
    if (!this._hasMouseInteracted) {
      // Para o primeiro desenho, faça o anterior e o próximo iguais
      this._updateMouseCoords();
      this._setProperty('_hasMouseInteracted', true);
    }
  };
  
  // NOTA: retorna indefinido se a posição estiver fora do intervalo válido
  function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    var xPos = evt.clientX - rect.left;
    var yPos = evt.clientY - rect.top;
    if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
      return {
        x: Math.round(xPos * canvas.offsetWidth / rect.width),
        y: Math.round(yPos * canvas.offsetHeight / rect.height)
      };
    }
  }
  
  // =============================================================================
  //                         extensões p5
  // TODO: Seria bom fazer com que eles fossem aceitos no p5
  // =============================================================================
  
  /**
   * Projeta um vetor na linha paralela a um segundo vetor, dando um terceiro
   * vetor que é a projeção ortogonal desse vetor na linha.
   * @see https://en.wikipedia.org/wiki/Vector_projection
   * @method project
   * @for p5.Vector
   * @static
   * @param {p5.Vector} a - vetor sendo projetado
   * @param {p5.Vector} b - vetor que define a linha de destino da projeção.
   * @return {p5.Vector} projeção de a na linha paralela a b.
   */
  p5.Vector.project = function(a, b) {
    return p5.Vector.mult(b, p5.Vector.dot(a, b) / p5.Vector.dot(b, b));
  };
  
  /**
   * Pergunte se um vetor é paralelo a este.
   * @method isParallel
   * @for p5.Vector
   * @param {p5.Vector} v2
   * @param {number} [tolerance] - margem de erro para comparações, entra em
    *        jogo ao comparar vetores girados. Por exemplo, nós queremos que
    *        <1, 0> seja paralelo a <0, 1> .rot (Math.PI / 2), mas a imprecisão de flutuação
    *         pode atrapalhar isso.
   * @return {boolean}
   */
  p5.Vector.prototype.isParallel = function(v2, tolerance) {
    tolerance = typeof tolerance === 'number' ? tolerance : 1e-14;
    return (
        Math.abs(this.x) < tolerance && Math.abs(v2.x) < tolerance
      ) || (
        Math.abs(this.y ) < tolerance && Math.abs(v2.y) < tolerance
      ) || (
        Math.abs(this.x / v2.x - this.y / v2.y) < tolerance
      );
  };
  
  // =============================================================================
  //                         adições p5
  // =============================================================================
  
  /**
   * Carrega uma imagem de um caminho e cria uma imagem a partir dele.
   * <br><br>
   * A imagem pode não estar imediatamente disponível para renderização
   * Se você quiser ter certeza de que a imagem está pronta antes de fazer
   * qualquer coisa com ela, coloque a chamada loadImageElement() em preload().
   * Você também pode fornecer uma função de retorno de chamada para lidar com a imagem quando ela estiver pronta.
   * <br><br>
   * O caminho para a imagem deve ser relativo ao arquivo HTML 
   * vinculado ao seu esboço. O carregamento de uma URL ou outro
   * local remoto pode ser bloqueado devido à segurança integrada do
   * seu navegador.
   *
   * @method loadImageElement
   * @param  {String} path Caminho da imagem a ser carregada
   * @param  {Function(Image)} [successCallback] Função a ser chamada uma vez que
    *                                a imagem é carregada. Será passada a
    *                                Imagem.
   * @param  {Function(Event)}    [failureCallback] chamada com o evento de erro se
   *                                a imagem falhar ao carregar.
   * @return {Image}                o objeto de Imagem
   */
  p5.prototype.loadImageElement = function(path, successCallback, failureCallback) {
    var img = new Image();
    var decrementPreload = p5._getDecrementPreload.apply(this, arguments);
  
    img.onload = function() {
      if (typeof successCallback === 'function') {
        successCallback(img);
      }
      if (decrementPreload && (successCallback !== decrementPreload)) {
        decrementPreload();
      }
    };
    img.onerror = function(e) {
      p5._friendlyFileLoadError(0, img.src);
      // não misture retorno de chamada de falha com decrementPreload
      if ((typeof failureCallback === 'function') &&
        (failureCallback !== decrementPreload)) {
        failureCallback(e);
      }
    };
  
    //definir crossOrigin caso a imagem seja veiculada com cabeçalhos CORS
    //isso nos permitirá desenhar na tela sem contaminá-la.
    //ver https://developer.mozilla.org/en-US/docs/HTML/CORS_Enabled_Image
    // Ao usar data-uris, o arquivo será carregado localmente
    // então não precisamos nos preocupar com crossOrigin com tipos de arquivo base64
    if(path.indexOf('data:image/') !== 0) {
      img.crossOrigin = 'Anonymous';
    }
  
    //começa a carregar a imagem
    img.src = path;
  
    return img;
  };
  
  /**
   * Desenhe um elemento de imagem para a tela principal do sketch p5js
   *
   * @method imageElement
   * @param  {Image}    imgEl    a imagem para exibir
   * @param  {Number}   [sx=0]   A coordenada X do canto superior esquerdo do
   *                             sub-retângulo da imagem de origem para desenhar
   *                             na tela de destino.
   * @param  {Number}   [sy=0]   A coordenada Y do canto superior esquerdo do
   *                             sub-retângulo da imagem de origem para desenhar
   *                             na tela de destino
   * @param {Number} [sWidth=imgEl.width] A largura do sub-retângulo da
   *                                      imagem de origem a ser desenhada na tela de
   *                                      destino.
   * @param {Number} [sHeight=imgEl.height] A altura do sub-retângulo da
   *                                      imagem de origem a ser desenhada na tela de
   *                                      destino.
   * @param  {Number}   [dx=0]    A coordenada X na tela de destino na
   *                              qual colocar o canto superior esquerdo da
   *                              imagem de origem.
   * @param  {Number}   [dy=0]    A coordenada Y na tela de destino na
   *                              qual colocar o canto superior esquerdo da
   *                              imagem de origem.
   * @param  {Number}   [dWidth] A largura para desenhar a imagem na tela de
   *                             destino. Isso permite dimensionar a imagem desenhada.
   * @param  {Number}   [dHeight] A altura para desenhar a imagem na tela de
   *                             destino. Isso permite dimensionar a imagem desenhada.
   * @example
   * <div>
   * <code>
   * var imgEl;
   * function preload() {
   *   imgEl = loadImageElement("assets/laDefense.jpg");
   * }
   * function setup() {
   *   imageElement(imgEl, 0, 0);
   *   imageElement(imgEl, 0, 0, 100, 100);
   *   imageElement(imgEl, 0, 0, 100, 100, 0, 0, 100, 100);
   * }
   * </code>
   * </div>
   * <div>
   * <code>
   * function setup() {
   *   // aqui usamos um retorno de chamada para exibir a imagem após o carregamento
   *   loadImageElement("assets/laDefense.jpg", function(imgEl) {
   *     imageElement(imgEl, 0, 0);
   *   });
   * }
   * </code>
   * </div>
   *
   * @alt
   * imagem da parte inferior de um guarda-chuva branco e teto gradeado acima
   * imagem da parte inferior de um guarda-chuva branco e teto gradeado acima
   *
   */
  p5.prototype.imageElement = function(imgEl, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    /**
     * Valida parâmetros de recorte. Por especificação de drawImage, sWidth e sHight não podem ser
     * negativos ou maiores do que a largura e altura intrínsecas da imagem
     * @private
     * @param {Number} sVal
     * @param {Number} iVal
     * @returns {Number}
     * @private
     */
    function _sAssign(sVal, iVal) {
      if (sVal > 0 && sVal < iVal) {
        return sVal;
      }
      else {
        return iVal;
      }
    }
  
    function modeAdjust(a, b, c, d, mode) {
      if (mode === p5.prototype.CORNER) {
        return {x: a, y: b, w: c, h: d};
      } else if (mode === p5.prototype.CORNERS) {
        return {x: a, y: b, w: c-a, h: d-b};
      } else if (mode === p5.prototype.RADIUS) {
        return {x: a-c, y: b-d, w: 2*c, h: 2*d};
      } else if (mode === p5.prototype.CENTER) {
        return {x: a-c*0.5, y: b-d*0.5, w: c, h: d};
      }
    }
  
    if (arguments.length <= 5) {
      dx = sx || 0;
      dy = sy || 0;
      sx = 0;
      sy = 0;
      dWidth = sWidth || imgEl.width;
      dHeight = sHeight || imgEl.height;
      sWidth = imgEl.width;
      sHeight = imgEl.height;
    } else if (arguments.length === 9) {
      sx = sx || 0;
      sy = sy || 0;
      sWidth = _sAssign(sWidth, imgEl.width);
      sHeight = _sAssign(sHeight, imgEl.height);
  
      dx = dx || 0;
      dy = dy || 0;
      dWidth = dWidth || imgEl.width;
      dHeight = dHeight || imgEl.height;
    } else {
      throw 'Wrong number of arguments to imageElement()';
    }
  
    var vals = modeAdjust(dx, dy, dWidth, dHeight,
      this._renderer._imageMode);
  
    if (this._renderer._tint) {
      // Criar/desenhar a tempo em uma tela temporária para que o tingimento
      // possa funcionar dentro do renderizador como faria para uma p5.Imagem
      // Apenas redimensione a tela se for muito pequena
      var context = this._tempCanvas.getContext('2d');
      if (this._tempCanvas.width < vals.w || this._tempCanvas.height < vals.h) {
        this._tempCanvas.width = Math.max(this._tempCanvas.width, vals.w);
        this._tempCanvas.height = Math.max(this._tempCanvas.height, vals.h);
      } else {
        context.clearRect(0, 0, vals.w, vals.h);
      }
      context.drawImage(imgEl,
        sx, sy, sWidth, sHeight,
        0, 0, vals.w, vals.h);
      // Chame o método image() do renderizador com um objeto que contém a Imagem
      // como uma propriedade 'elt' e também a tela temporária (quando necessário):
      this._renderer.image({canvas: this._tempCanvas},
        0, 0, vals.w, vals.h,
        vals.x, vals.y, vals.w, vals.h);
    } else {
      this._renderer.image({elt: imgEl},
        sx, sy, sWidth, sHeight,
        vals.x, vals.y, vals.w, vals.h);
    }
  };
  
  /**
  * Um grupo contendo todos os sprites no sketch.
  *
  * @property allSprites
  * @for p5.play
  * @type {Group}
  */
  
  defineLazyP5Property('allSprites', function() {
    return new p5.prototype.Group();
  });
  
  p5.prototype._mouseButtonIsPressed = function(buttonCode) {
    return (this.mouseIsPressed && this.mouseButton === buttonCode) ||
      (this.touchIsDown && buttonCode === this.LEFT);
  };
  
  p5.prototype.mouseDidMove = function() {
    return this.pmouseX !== this.mouseX || this.pmouseY !== this.mouseY;
  };
  
  p5.prototype.mouseIsOver = function(sprite) {
    if (!sprite) {
      return false;
    }
  
    if (!sprite.collider) {
      sprite.setDefaultCollider();
    }
  
    var mousePosition;
    if (this.camera.active) {
      mousePosition = this.createVector(this.camera.mouseX, this.camera.mouseY);
    } else {
      mousePosition = this.createVector(this.mouseX, this.mouseY);
    }
  
    return sprite.collider.overlap(new window.p5.PointCollider(mousePosition));
  };
  
  p5.prototype.mousePressedOver = function(sprite) {
    return (this.mouseIsPressed || this.touchIsDown) && this.mouseIsOver(sprite);
  };
  
  var styleEmpty = 'rgba(0,0,0,0)';
  
  p5.Renderer2D.prototype.regularPolygon = function(x, y, sides, size, rotation) {
    var ctx = this.drawingContext;
    var doFill = this._doFill, doStroke = this._doStroke;
    if (doFill && !doStroke) {
      if (ctx.fillStyle === styleEmpty) {
        return this;
      }
    } else if (!doFill && doStroke) {
      if (ctx.strokeStyle === styleEmpty) {
        return this;
      }
    }
    if (sides < 3) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + size * Math.cos(rotation), y + size * Math.sin(rotation));
    for (var i = 1; i < sides; i++) {
      var angle = rotation + (i * 2 * Math.PI / sides);
      ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
    }
    ctx.closePath();
    if (doFill) {
      ctx.fill();
    }
    if (doStroke) {
      ctx.stroke();
    }
  };
  
  p5.prototype.regularPolygon = function(x, y, sides, size, rotation) {
    if (!this._renderer._doStroke && !this._renderer._doFill) {
      return this;
    }
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; ++i) {
      args[i] = arguments[i];
    }
  
    if (typeof rotation === 'undefined') {
      rotation = -(Math.PI / 2);
      if (0 === sides % 2) {
        rotation += Math.PI / sides;
      }
    } else if (this._angleMode === this.DEGREES) {
      rotation = this.radians(rotation);
    }
  
    // NOTA: apenas implementado para não 3D
    if (!this._renderer.isP3D) {
      this._validateParameters(
        'regularPolygon',
        args,
        [
          ['Number', 'Number', 'Number', 'Number'],
          ['Number', 'Number', 'Number', 'Number', 'Number']
        ]
      );
      this._renderer.regularPolygon(
        args[0],
        args[1],
        args[2],
        args[3],
        rotation
      );
    }
    return this;
  };
  
  p5.Renderer2D.prototype.shape = function() {
    var ctx = this.drawingContext;
    var doFill = this._doFill, doStroke = this._doStroke;
    if (doFill && !doStroke) {
      if (ctx.fillStyle === styleEmpty) {
        return this;
      }
    } else if (!doFill && doStroke) {
      if (ctx.strokeStyle === styleEmpty) {
        return this;
      }
    }
    var numCoords = arguments.length / 2;
    if (numCoords < 1) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(arguments[0], arguments[1]);
    for (var i = 1; i < numCoords; i++) {
      ctx.lineTo(arguments[i * 2], arguments[i * 2 + 1]);
    }
    ctx.closePath();
    if (doFill) {
      ctx.fill();
    }
    if (doStroke) {
      ctx.stroke();
    }
  };
  
  p5.prototype.shape = function() {
    if (!this._renderer._doStroke && !this._renderer._doFill) {
      return this;
    }
    // NOTA: apenas implementado para não 3D
    if (!this._renderer.isP3D) {
      // TODO: chamar this._validateParameters, uma vez que estiver funcionando no p5.js e
      // nós entendendo se pode ser usada para funções var args assim
      this._renderer.shape.apply(this._renderer, arguments);
    }
    return this;
  };
  
  p5.prototype.rgb = function(r, g, b, a) {
    // converter de 0 para 255 para 0 para 1
    if (!a) {
      a = 1;
    }
    a = a * 255;
  
    return this.color(r, g, b, a);
  };
  
  p5.prototype.createGroup = function() {
    return new this.Group();
  };
  
  defineLazyP5Property('World', function() {
    var World = {
      pInst: this
    };
  
    function createReadOnlyP5PropertyAlias(name) {
      Object.defineProperty(World, name, {
        enumerable: true,
        get: function() {
          return this.pInst[name];
        }
      });
    }
  
    createReadOnlyP5PropertyAlias('width');
    createReadOnlyP5PropertyAlias('height');
    createReadOnlyP5PropertyAlias('mouseX');
    createReadOnlyP5PropertyAlias('mouseY');
    createReadOnlyP5PropertyAlias('allSprites');
    createReadOnlyP5PropertyAlias('frameCount');
  
    Object.defineProperty(World, 'frameRate', {
      enumerable: true,
      get: function() {
        return this.pInst.frameRate();
      },
      set: function(value) {
        this.pInst.frameRate(value);
      }
    });
  
    Object.defineProperty(World, 'seconds', {
      enumerable: true,
      get: function() {
        var currentDate = new Date();
        var currentTime = currentDate.getTime();
        return Math.round((currentTime - this.pInst._startTime) / 1000);
      }
    });
  
    return World;
  });
  
  p5.prototype.spriteUpdate = true;
  
  /**
     * Um Sprite é o bloco de construção principal de p5.play:
     * um elemento capaz de armazenar imagens ou animações com um conjunto de
     * propriedades como posição e visibilidade.
     * Um Sprite pode ter um colisor que define a área ativa para detectar
     * colisões ou sobreposições com outros sprites e interações do mouse.
     *
     * Sprites criados usando createSprite (a forma preferida) são adicionados ao
     * grupo allSprites e dado um valor de profundidade que o coloca na frente de todos
     * outros sprites.
     *
     * @method createSprite
     * @param {Number} x Coordenada x inicial
     * @param {Number} y Coordenada y inicial
     * @param {Number} width Largura do retângulo marcador e do
     *                       colisor até que uma imagem ou novo colisor seja definido
     * @param {Number} height Altura do retângulo marcador e do
     *                       colisor até que uma imagem ou novo colisor seja definido
     * @return {Object} A nova instância de sprite
     */
  
  p5.prototype.createSprite = function(x, y, width, height) {
    var s = new Sprite(this, x, y, width, height);
    s.depth = this.allSprites.maxDepth()+1;
    this.allSprites.add(s);
    return s;
  };
  
  
  /**
     * Remove um Sprite do sketch.
     * O Sprite removido não será mais desenhado ou atualizado.
     * Equivalente a Sprite.remove()
     *
     * @method removeSprite
     * @param {Object} sprite Sprite a ser removido
  */
  p5.prototype.removeSprite = function(sprite) {
    sprite.remove();
  };
  
  /**
  * Atualiza todos os sprites no sketch (posição, animação ...)
  * é chamado automaticamente a cada draw().
  * Pode ser pausado passando um parâmetro true ou false;
  * Nota: não renderiza os sprites.
  *
  * @method updateSprites
  * @param {Boolean} atualizando false para pausar a atualização, true para continuar
  */
  p5.prototype.updateSprites = function(upd) {
  
    if(upd === false)
      this.spriteUpdate = false;
    if(upd === true)
      this.spriteUpdate = true;
  
    if(this.spriteUpdate)
    for(var i = 0; i<this.allSprites.size(); i++)
    {
      this.allSprites.get(i).update();
    }
  };
  
  /**
  * Retorna todos os sprites no sketch como uma matriz
  *
  * @method getSprites
  * @return {Array} Matriz de Sprites
  */
  p5.prototype.getSprites = function() {
  
    //desenha tudo
    if(arguments.length===0)
    {
      return this.allSprites.toArray();
    }
    else
    {
      var arr = [];
      //para cada tag
      for(var j=0; j<arguments.length; j++)
      {
        for(var i = 0; i<this.allSprites.size(); i++)
        {
          if(this.allSprites.get(i).isTagged(arguments[j]))
            arr.push(this.allSprites.get(i));
        }
      }
  
      return arr;
    }
  
  };
  
  /**
  * Exibe um grupo de sprites.
  * Se nenhum parâmetro for especificado, desenha todos os sprites no
  * sketch.
  * A ordem do desenho é determinada pela propriedade Sprite "profundidade"
  *
  * @method drawSprites
  * @param {Group} [group] Grupo de Sprites a serem exibidos
  */
  p5.prototype.drawSprites = function(group) {
    // Se nenhum grupo for fornecido, desenhe o grupo allSprites.
    group = group || this.allSprites;
  
    if (typeof group.draw !== 'function')
    {
      throw('Error: with drawSprites you can only draw all sprites or a group');
    }
  
    group.draw();
  };
  
  /**
  * Exibe um Sprite.
  * Para ser usado normalmente na função draw principal.
  *
  * @method drawSprite
  * @param {Sprite} sprite Sprite a ser exibido
  */
  p5.prototype.drawSprite = function(sprite) {
    if(sprite)
    sprite.display();
  };
  
  /**
  * Carrega uma animação.
  * Para ser usado normalmente na função preload() do sketch.
  *
  * @method loadAnimation
  * @param {Sprite} sprite Sprite a ser exibido
  */
  p5.prototype.loadAnimation = function() {
    return construct(this.Animation, arguments);
  };
  
  /**
   * Carrega uma planilha de Sprite.
   * Para ser usado normalmente na função preload() do sketch.
   *
   * @method loadSpriteSheet
   */
  p5.prototype.loadSpriteSheet = function() {
    return construct(this.SpriteSheet, arguments);
  };
  
  /**
  * Exibe uma animação.
  *
  * @method animation
  * @param {Animation} anim Animação a ser exibida
  * @param {Number} x coordenada X
  * @param {Number} y coordenada Y
  *
  */
  p5.prototype.animation = function(anim, x, y) {
    anim.draw(x, y);
  };
  
  //variável para detectar pressões instantâneas
  defineLazyP5Property('_p5play', function() {
    return {
      keyStates: {},
      mouseStates: {}
    };
  });
  
  var KEY_IS_UP = 0;
  var KEY_WENT_DOWN = 1;
  var KEY_IS_DOWN = 2;
  var KEY_WENT_UP = 3;
  
  /**
  * Detecta se uma tecla foi pressionada durante o último ciclo.
  * Pode ser usado para disparar eventos uma vez, quando uma tecla é pressionada ou liberada.
  * Exemplo: Super Mario pulando.
  *
  * @method keyWentDown
  * @param {Number|String} key Código-chave ou caractere
  * @return {Boolean} True se a tecla foi pressionada
  */
  p5.prototype.keyWentDown = function(key) {
    return this._isKeyInState(key, KEY_WENT_DOWN);
  };
  
  
  /**
  * Detecta se uma tecla foi liberada durante o último ciclo.
  * Pode ser usado para disparar eventos uma vez, quando uma tecla é pressionada ou liberada.
  * Exemplo: disparos de nave espacial.
  *
  * @method keyWentUp
  * @param {Number|String} key Código-chave ou caractere
  * @return {Boolean} True se a tecla foi pressionada
  */
  p5.prototype.keyWentUp = function(key) {
    return this._isKeyInState(key, KEY_WENT_UP);
  };
  
  /**
  * Detecta se uma tecla está pressionada no momento
  * Como p5 keyIsDown, mas aceita strings e códigos
  *
  * @method keyDown
  * @param {Number|String} key Código-chave ou caractere
  * @return {Boolean} True se a tecla estiver pressionada
  */
  p5.prototype.keyDown = function(key) {
    return this._isKeyInState(key, KEY_IS_DOWN);
  };
  
  /**
   * Detecta se uma chave está no estado fornecido durante o último ciclo.
   * Método auxiliar que encapsula a lógica de estado de chave comum; pode ser preferível
   * chamar keyDown ou outros métodos diretamente.
   *
   * @private
   * @method _isKeyInState
   * @param {Number|String} key Código-chave ou caractere
   * @param {Number} state Estado-chave para verificar
   * @return {Boolean} True se a chave está no estado fornecido
   */
  p5.prototype._isKeyInState = function(key, state) {
    var keyCode;
    var keyStates = this._p5play.keyStates;
  
    if(typeof key === 'string')
    {
      keyCode = this._keyCodeFromAlias(key);
    }
    else
    {
      keyCode = key;
    }
  
    //se indefinido, comece a verificar
    if(keyStates[keyCode]===undefined)
    {
      if(this.keyIsDown(keyCode))
        keyStates[keyCode] = KEY_IS_DOWN;
      else
        keyStates[keyCode] = KEY_IS_UP;
    }
  
    return (keyStates[keyCode] === state);
  };
  
  /**
  * Detecta se um botão do mouse está pressionado
  * Combina mouseIsPressed e mouseButton de p5
  *
  * @method mouseDown
  * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
  * @return {Boolean} True se o botão estiver pressionado
  */
  p5.prototype.mouseDown = function(buttonCode) {
    return this._isMouseButtonInState(buttonCode, KEY_IS_DOWN);
  };
  
  /**
  * Detects if a mouse button is currently up
  * Combines mouseIsPressed and mouseButton of p5
  *
  * @method mouseUp
  * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
  * @return {Boolean} True se o botão estiver solto
  */
  p5.prototype.mouseUp = function(buttonCode) {
    return this._isMouseButtonInState(buttonCode, KEY_IS_UP);
  };
  
  /**
   * Detecta se um botão do mouse foi liberado durante o último ciclo.
   * Pode ser usado para acionar eventos uma vez, para serem verificados no ciclo de desenho
   *
   * @method mouseWentUp
   * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
   * @return {Boolean} True se o botão acabou de ser liberado
   */
  p5.prototype.mouseWentUp = function(buttonCode) {
    return this._isMouseButtonInState(buttonCode, KEY_WENT_UP);
  };
  
  
  /**
   * Detecta se um botão do mouse foi pressionado durante o último ciclo.
   * Pode ser usado para acionar eventos uma vez, para serem verificados no ciclo de desenho
   *
   * @method mouseWentDown
   * @param {Number} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
   * @return {Boolean} True se o botão foi apenas pressionado
   */
  p5.prototype.mouseWentDown = function(buttonCode) {
    return this._isMouseButtonInState(buttonCode, KEY_WENT_DOWN);
  };
  
  /**
   * Retorna uma constante para um estado do mouse, dado um string ou uma constante de botão do mouse.
   *
   * @private
   * @method _clickKeyFromString
   * @param {Number|String} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
   *   ou string 'leftButton', 'rightButton', ou 'centerButton'
   * @return {Number} Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL ou valor de buttonCode
   */
  p5.prototype._clickKeyFromString = function(buttonCode) {
    if (this.CLICK_KEY[buttonCode]) {
      return this.CLICK_KEY[buttonCode];
    } else {
      return buttonCode;
    }
  };
  
  // Mapa de strings para constantes para estados do mouse.
  p5.prototype.CLICK_KEY = {
    'leftButton': p5.prototype.LEFT,
    'rightButton': p5.prototype.RIGHT,
    'centerButton': p5.prototype.CENTER
  };
  
  /**
   * Detecta se um botão do mouse está no estado fornecido durante o último ciclo.
   * Método auxiliar que encapsula a lógica comum de estado do botão do mouse; pode ser
   * preferível chamar mouseWentUp, etc, diretamente.
   *
   * @private
   * @method _isMouseButtonInState
   * @param {Number|String} [buttonCode] Constante do botão do mouse ESQUERDA, DIREITA ou CENTRAL
   *   ou string 'leftButton', 'rightButton', ou 'centerButton'
   * @param {Number} state
   * @return {boolean} True se o botão estava no estado fornecido
   */
  p5.prototype._isMouseButtonInState = function(buttonCode, state) {
    var mouseStates = this._p5play.mouseStates;
  
    buttonCode = this._clickKeyFromString(buttonCode);
  
    if(buttonCode === undefined)
      buttonCode = this.LEFT;
  
    //indefinido = ainda não rastreado, comece a rastrear
    if(mouseStates[buttonCode]===undefined)
    {
    if (this._mouseButtonIsPressed(buttonCode))
      mouseStates[buttonCode] = KEY_IS_DOWN;
    else
      mouseStates[buttonCode] = KEY_IS_UP;
    }
  
    return (mouseStates[buttonCode] === state);
  };
  
  
  /**
   * Um objeto que armazena todas as chaves úteis para fácil acesso
   * Key.tab = 9
   *
   * @private
   * @property KEY
   * @type {Object}
   */
  p5.prototype.KEY = {
      'BACKSPACE': 8,
      'TAB': 9,
      'ENTER': 13,
      'SHIFT': 16,
      'CTRL': 17,
      'ALT': 18,
      'PAUSE': 19,
      'CAPS_LOCK': 20,
      'ESC': 27,
      'SPACE': 32,
      ' ': 32,
      'PAGE_UP': 33,
      'PAGE_DOWN': 34,
      'END': 35,
      'HOME': 36,
      'LEFT_ARROW': 37,
      'LEFT': 37,
      'UP_ARROW': 38,
      'UP': 38,
      'RIGHT_ARROW': 39,
      'RIGHT': 39,
      'DOWN_ARROW': 40,
      'DOWN': 40,
      'INSERT': 45,
      'DELETE': 46,
      '0': 48,
      '1': 49,
      '2': 50,
      '3': 51,
      '4': 52,
      '5': 53,
      '6': 54,
      '7': 55,
      '8': 56,
      '9': 57,
      'A': 65,
      'B': 66,
      'C': 67,
      'D': 68,
      'E': 69,
      'F': 70,
      'G': 71,
      'H': 72,
      'I': 73,
      'J': 74,
      'K': 75,
      'L': 76,
      'M': 77,
      'N': 78,
      'O': 79,
      'P': 80,
      'Q': 81,
      'R': 82,
      'S': 83,
      'T': 84,
      'U': 85,
      'V': 86,
      'W': 87,
      'X': 88,
      'Y': 89,
      'Z': 90,
      '0NUMPAD': 96,
      '1NUMPAD': 97,
      '2NUMPAD': 98,
      '3NUMPAD': 99,
      '4NUMPAD': 100,
      '5NUMPAD': 101,
      '6NUMPAD': 102,
      '7NUMPAD': 103,
      '8NUMPAD': 104,
      '9NUMPAD': 105,
      'MULTIPLY': 106,
      'PLUS': 107,
      'MINUS': 109,
      'DOT': 110,
      'SLASH1': 111,
      'F1': 112,
      'F2': 113,
      'F3': 114,
      'F4': 115,
      'F5': 116,
      'F6': 117,
      'F7': 118,
      'F8': 119,
      'F9': 120,
      'F10': 121,
      'F11': 122,
      'F12': 123,
      'EQUAL': 187,
      'COMMA': 188,
      'SLASH': 191,
      'BACKSLASH': 220
  };
  
  /**
   * Um objeto que armazena aliases de chave obsoletos, que ainda suportamos, mas
   * deve ser mapeado para aliases válidos e gerar avisos.
   *
   * @private
   * @property KEY_DEPRECATIONS
   * @type {Object}
   */
  p5.prototype.KEY_DEPRECATIONS = {
    'MINUT': 'MINUS',
    'COMA': 'COMMA'
  };
  
  /**
   * Dado um alias de chave de string (conforme definido na propriedade KEY acima), procure
   * e retorna o código-chave numérico JavaScript para essa chave. Se um
   * alias for passado (conforme definido na propriedade KEY_DEPRECATIONS) será
   * mapeado para um código de chave válido, mas também gerará um aviso sobre o uso
   * do alias obsoleto.
   *
   * @private
   * @method _keyCodeFromAlias
   * @param {!string} alias - um alias de chave que não diferencia maiúsculas de minúsculas
   * @return {number|undefined} um código-chave JavaScript numérico ou indefinido
   *          se nenhum código de chave correspondente ao alias fornecido for encontrado.
   */
  p5.prototype._keyCodeFromAlias = function(alias) {
    alias = alias.toUpperCase();
    if (this.KEY_DEPRECATIONS[alias]) {
      this._warn('Key literal "' + alias + '" is deprecated and may be removed ' +
        'in a future version of p5.play. ' +
        'Please use "' + this.KEY_DEPRECATIONS[alias] + '" instead.');
      alias = this.KEY_DEPRECATIONS[alias];
    }
    return this.KEY[alias];
  };
  
  //pre draw: detectar keyStates
  p5.prototype.readPresses = function() {
    var keyStates = this._p5play.keyStates;
    var mouseStates = this._p5play.mouseStates;
  
    for (var key in keyStates) {
      if(this.keyIsDown(key)) //se está inativo
      {
        if(keyStates[key] === KEY_IS_UP)//e estava ativo
          keyStates[key] = KEY_WENT_DOWN;
        else
          keyStates[key] = KEY_IS_DOWN; //agora está simplesmente inativo
      }
      else //se está inativo
      {
        if(keyStates[key] === KEY_IS_DOWN)//e estava ativo
          keyStates[key] = KEY_WENT_UP;
        else
          keyStates[key] = KEY_IS_UP; //agora está simplesmente inativo
      }
    }
  
    //mouse
    for (var btn in mouseStates) {
  
      if(this._mouseButtonIsPressed(btn)) //se está inativo
      {
        if(mouseStates[btn] === KEY_IS_UP)//e estava ativo
          mouseStates[btn] = KEY_WENT_DOWN;
        else
          mouseStates[btn] = KEY_IS_DOWN; //agora está simplesmente inativo
      }
      else //se está inativo
      {
        if(mouseStates[btn] === KEY_IS_DOWN)//e estava ativo
          mouseStates[btn] = KEY_WENT_UP;
        else
          mouseStates[btn] = KEY_IS_UP; //agora está simplesmente inativo
      }
    }
  
  };
  
  /**
  * Liga ou desliga o quadTree.
  * Um quadtree é uma estrutura de dados usada para otimizar a detecção de colisão.
  * Pode melhorar o desempenho quando há um grande número de Sprites a serem
  * verificados continuamente quanto a sobreposição.
  *
  * p5.play irá criar e atualizar um quadtree automaticamente, no entanto é
  * inativo por padrão.
  *
  * @method useQuadTree
  * @param {Boolean} use Pass true para ativar, false para desativar
  */
  p5.prototype.useQuadTree = function(use) {
  
    if(this.quadTree !== undefined)
    {
      if(use === undefined)
        return this.quadTree.active;
      else if(use)
        this.quadTree.active = true;
      else
        this.quadTree.active = false;
    }
    else
      return false;
  };
  
  //o quadTree verdadeiro
  defineLazyP5Property('quadTree', function() {
    var quadTree = new Quadtree({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }, 4);
    quadTree.active = false;
    return quadTree;
  });
  
  /*
  //delta independente da taxa de quadros, realmente não funciona
  p5.prototype.deltaTime = 1;
  
  var now = Date.now();
  var then = Date.now();
  var INTERVAL_60 = 0.0166666; //60 fps
  
  function updateDelta() {
  then = now;
  now = Date.now();
  deltaTime = ((now - then) / 1000)/INTERVAL_60; // segundos desde o último quadro
  }
  */
  
  /**
     * Um Sprite é o bloco de construção principal de p5.play:
     * um elemento capaz de armazenar imagens ou animações com um conjunto de
     * propriedades como posição e visibilidade.
     * Um Sprite pode ter um colisor que define a área ativa para detectar
     * colisões ou sobreposições com outros sprites e interações do mouse.
     *
     * Para criar um Sprite, use
     * {{#crossLink "p5.play/createSprite:method"}}{{/crossLink}}.
     *
     * @class Sprite
     */
  
  // Para obter detalhes sobre por que esses documentos não estão em um bloco de comentários do YUIDoc, consulte:
  //
  // https://github.com/molleindustria/p5.play/pull/67
  //
  // @param {Number} x Coordenada x inicial
  // @param {Number} y Coordenada y inicial
  // @param {Number} width Largura do retângulo marcador e do
  //                      colisor até que uma imagem ou novo colisor seja definido
  // @param {Number} height Altura do retângulo marcador e do
  //                      colisor até que uma imagem ou novo colisor seja definido
  function Sprite(pInst, _x, _y, _w, _h) {
    var pInstBind = createPInstBinder(pInst);
  
    var createVector = pInstBind('createVector');
    var color = pInstBind('color');
    var print = pInstBind('print');
    var push = pInstBind('push');
    var pop = pInstBind('pop');
    var colorMode = pInstBind('colorMode');
    var tint = pInstBind('tint');
    var lerpColor = pInstBind('lerpColor');
    var noStroke = pInstBind('noStroke');
    var rectMode = pInstBind('rectMode');
    var ellipseMode = pInstBind('ellipseMode');
    var imageMode = pInstBind('imageMode');
    var translate = pInstBind('translate');
    var scale = pInstBind('scale');
    var rotate = pInstBind('rotate');
    var stroke = pInstBind('stroke');
    var strokeWeight = pInstBind('strokeWeight');
    var line = pInstBind('line');
    var noFill = pInstBind('noFill');
    var fill = pInstBind('fill');
    var textAlign = pInstBind('textAlign');
    var textSize = pInstBind('textSize');
    var text = pInstBind('text');
    var rect = pInstBind('rect');
    var cos = pInstBind('cos');
    var sin = pInstBind('sin');
    var atan2 = pInstBind('atan2');
  
    var quadTree = pInst.quadTree;
    var camera = pInst.camera;
  
  
    // Essas são constantes p5 às quais gostaríamos de ter acesso fácil.
    var RGB = p5.prototype.RGB;
    var CENTER = p5.prototype.CENTER;
    var LEFT = p5.prototype.LEFT;
    var BOTTOM = p5.prototype.BOTTOM;
  
    /**
    * A posição do sprite, do sprite como um vetor (x, y).
    * @property position
    * @type {p5.Vector}
    */
    this.position = createVector(_x, _y);
  
    /**
    * A posição do sprite no início da última atualização como um vetor (x, y).
    * @property previousPosition
    * @type {p5.Vector}
    */
    this.previousPosition = createVector(_x, _y);
  
    /*
    A posição do sprite no final da última atualização como um vetor (x, y).
    Nota: isso será diferente da posição sempre que a posição for alterada
    diretamente por atribuição.
    */
    this.newPosition = createVector(_x, _y);
  
    //Deslocamento de posição na coordenada x desde a última atualização
    this.deltaX = 0;
    this.deltaY = 0;
  
    /**
    * A velocidade do sprite como um vetor (x, y)
    * Velocidade é a velocidade dividida em seus componentes verticais e horizontais.
    *
    * @property velocity
    * @type {p5.Vector}
    */
    this.velocity = createVector(0, 0);
  
    /**
    * Defina um limite para a velocidade escalar do sprite, independentemente da direção.
    * O valor só pode ser positivo. Se definido como -1, não há limite.
    *
    * @property maxSpeed
    * @type {Number}
    * @default -1
    */
    this.maxSpeed = -1;
  
    /**
    * Fator de atrito, reduz a velocidade do sprite.
    * O atrito deve ser próximo a 0 (por exemplo: 0,01)
    * 0: sem atrito
    * 1: atrito total
    *
    * @property friction
    * @type {Number}
    * @default 0
    */
    this.friction = 0;
  
    /**
    * O colisor atual do sprite.
    * Pode ser uma caixa delimitadora alinhada com o eixo (um retângulo não girado)
    * ou um colisor circular.
    * Se o sprite estiver marcado para eventos de colisão, salto, sobreposição ou mouse, o
    * colisor é criado automaticamente a partir da largura e altura
    * do sprite ou da dimensão da imagem no caso de sprites animados
    *
    * Você pode definir um colisor personalizado com Sprite.setCollider
    *
    * @property collider
    * @type {Object}
    */
    this.collider = undefined;
  
    /**
    * Objeto contendo informações sobre a colisão / sobreposição mais recente
    * Para ser usado normalmente em combinação com funções Sprite.overlap ou
    * Sprite.collide.
    * As propriedades são touching.left, touching.right, touching.top,
    * touch.bottom e são true ou false, dependendo do lado do
    * colisor.
    *
    * @property touching
    * @type {Object}
    */
    this.touching = {};
    this.touching.left = false;
    this.touching.right = false;
    this.touching.top = false;
    this.touching.bottom = false;
  
    /**
    * A massa determina a transferência de velocidade quando os sprites saltam
    * uns contra os outros. Veja Sprite.bounce
    * Quanto maior a massa, menos o sprite será afetado pelas colisões.
    *
    * @property mass
    * @type {Number}
    * @default 1
    */
    this.mass = 1;
  
    /**
    * Se definido como true, o sprite não irá saltar ou ser deslocado por colisões
    * Simula uma massa infinita ou um objeto ancorado.
    *
    * @property immovable
    * @type {Boolean}
    * @default false
    */
    this.immovable = false;
  
    //Coeficiente de restituição - velocidade perdida no salto
    //0 perfeitamente inelástico, 1 elástico,> 1 hiperelástico
  
    /**
    * Coeficiente de restituição. A velocidade perdida após o salto.
    * 1: perfeitamente elástico, nenhuma energia é perdida
    * 0: perfeitamente inelástico, sem salto
    * menor que 1: inelástico, este é o mais comum na natureza
    * maior que 1: hiperelástico, a energia é aumentada como em um pára-choque de pinball
    *
    * @property restitution
    * @type {Number}
    * @default 1
    */
    this.restitution = 1;
  
    /**
    * Rotação em graus do elemento visual (imagem ou animação)
    * Nota: esta não é a direção do movimento, consulte getDirection.
    *
    * @property rotation
    * @type {Number}
    * @default 0
    */
    Object.defineProperty(this, 'rotation', {
      enumerable: true,
      get: function() {
        return this._rotation;
      },
      set: function(value) {
        this._rotation = value;
        if (this.rotateToDirection) {
          this.setSpeed(this.getSpeed(), value);
        }
      }
    });
  
    /**
    * Variável de rotação interna (expressa em graus).
    * Nota: chamadores externos acessam isso por meio da propriedade de rotação acima.
    *
    * @private
    * @property _rotation
    * @type {Number}
    * @default 0
    */
    this._rotation = 0;
  
    /**
    * Mudança de rotação em graus por quadro do elemento visual (imagem ou animação)
    * Nota: esta não é a direção do movimento, consulte getDirection.
    *
    * @property rotationSpeed
    * @type {Number}
    * @default 0
    */
    this.rotationSpeed = 0;
  
  
    /**
    * Bloqueia automaticamente a propriedade de rotação do elemento visual
    * (imagem ou animação) para a direção do movimento do sprite e vice-versa.
    *
    * @property rotateToDirection
    * @type {Boolean}
    * @default false
    */
    this.rotateToDirection = false;
  
  
    /**
    * Determina a ordem de renderização dentro de um grupo: um sprite com menor
    * profundidade aparecerá abaixo daqueles com maior profundidade.
    *
    * Nota: desenhar um grupo antes de outro com drawSprites fará
    * com que seus membros apareçam abaixo do segundo, como no desenho de
    * tela p5 normal.
    *
    * @property depth
    * @type {Number}
    * @default One mais do que a maior profundidade de sprite existente, ao chamar
    *          createSprite(). Ao chamar um novo Sprite() diretamente, a profundidade irá
    *          inicializar em 0 (não recomendado).
    */
    this.depth = 0;
  
    /**
    * Determina a escala do sprite.
    * Exemplo: 2 terá o dobro do tamanho nativo dos visuais,
    * 0,5 será a metade. A ampliação pode tornar as imagens desfocadas.
    *
    * @property scale
    * @type {Number}
    * @default 1
    */
    this.scale = 1;
  
    var dirX = 1;
    var dirY = 1;
  
    /**
    * A visibilidade do sprite.
    *
    * @property visible
    * @type {Boolean}
    * @default true
    */
    this.visible = true;
  
    /**
    * Se definido como verdadeiro, o sprite rastreará o estado do mouse.
    * as propriedades mouseIsPressed e mouseIsOver serão atualizadas.
    * Nota: definido automaticamente como verdadeiro se as funções
    * onMouseReleased ou onMousePressed estão definidos.
    *
    * @property mouseActive
    * @type {Boolean}
    * @default false
    */
    this.mouseActive = false;
  
    /**
    * Verdadeiro se o mouse estiver no colisor do sprite.
    * Somente leitura.
    *
    * @property mouseIsOver
    * @type {Boolean}
    */
    this.mouseIsOver = false;
  
    /**
    * Verdadeiro se o mouse for pressionado no colisor do sprite.
    * Somente leitura.
    *
    * @property mouseIsPressed
    * @type {Boolean}
    */
    this.mouseIsPressed = false;
  
    /*
    * Largura da imagem atual do sprite.
    * Se nenhuma imagem ou animação forem definidas, é a largura do
    * retângulo marcador.
    * Usado internamente para fazer cálculos e desenhar o sprite.
    *
    * @private
    * @property _internalWidth
    * @type {Number}
    * @default 100
    */
    this._internalWidth = _w;
  
    /*
    * Altura da imagem atual do sprite.
    * Se nenhuma imagem ou animação forem definidas, é a altura do
    * retângulo marcador.
    * Usado internamente para fazer cálculos e desenhar o sprite.
    *
    * @private
    * @property _internalHeight
    * @type {Number}
    * @default 100
    */
    this._internalHeight = _h;
  
    /*
     * @type {number}
     * @private
     * _horizontalStretch é o valor para dimensionar sprites de animação na direção X
     */
    this._horizontalStretch = 1;
  
    /*
     * @type {number}
     * @private
     * _verticalStretch é o valor para dimensionar sprites de animação na direção Y
     */
    this._verticalStretch = 1;
  
    /*
     * _internalWidth and _internalHeight são usados para todos os p5.play
     * cálculos, mas largura e altura podem ser estendidas. Por exemplo,
     * você pode querer que os usuários sempre obtenham e definam uma largura dimensionada:
        Object.defineProperty(this, 'width', {
          enumerable: true,
          configurable: true,
          get: function() {
            return this._internalWidth * this.scale;
          },
          set: function(value) {
            this._internalWidth = value / this.scale;
          }
        });
     */
  
    /**
    * Largura da imagem atual do sprite.
    * Se nenhuma imagem ou animação forem definidas, é a largura do
    * retângulo marcador.
    *
    * @property width
    * @type {Number}
    * @default 100
    */
    Object.defineProperty(this, 'width', {
      enumerable: true,
      configurable: true,
      get: function() {
        if (this._internalWidth === undefined) {
          return 100;
        } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
          return this._internalWidth * this._horizontalStretch;
        } else {
          return this._internalWidth;
        }
      },
      set: function(value) {
        if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
          this._horizontalStretch = value / this._internalWidth;
        } else {
          this._internalWidth = value;
        }
      }
    });
  
    if(_w === undefined)
      this.width = 100;
    else
      this.width = _w;
  
    /**
    * Altura da imagem atual do sprite.
    * Se nenhuma imagem ou animação forem definidas, é a altura do
    * retângulo marcador.
    *
    * @property height
    * @type {Number}
    * @default 100
    */
    Object.defineProperty(this, 'height', {
      enumerable: true,
      configurable: true,
      get: function() {
        if (this._internalHeight === undefined) {
          return 100;
        } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
          return this._internalHeight * this._verticalStretch;
        } else {
          return this._internalHeight;
        }
      },
      set: function(value) {
        if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
          this._verticalStretch = value / this._internalHeight;
        } else {
          this._internalHeight = value;
        }
      }
    });
  
    if(_h === undefined)
      this.height = 100;
    else
      this.height = _h;
  
    /**
    * Largura sem escala do sprite
    * Se nenhuma imagem ou animação forem definidas, é a largura do
    * retângulo marcador.
    *
    * @property originalWidth
    * @type {Number}
    * @default 100
    */
    this.originalWidth = this._internalWidth;
  
    /**
    * Altura sem escala do sprite
    * Se nenhuma imagem ou animação forem definidas, é a altura do
    * retângulo marcador.
    *
    * @property originalHeight
    * @type {Number}
    * @default 100
    */
    this.originalHeight = this._internalHeight;
  
    /**
     * Obtém a largura em escala do sprite.
     *
     * @method getScaledWidth
     * @return {Number} Scaled width
     */
    this.getScaledWidth = function() {
      return this.width * this.scale;
    };
  
    /**
     * Obtém a altura dimensionada do sprite.
     *
     * @method getScaledHeight
     * @return {Number} Scaled height
     */
    this.getScaledHeight = function() {
      return this.height * this.scale;
    };
  
    /**
    * True se o sprite foi removido.
    *
    * @property removed
    * @type {Boolean}
    */
    this.removed = false;
  
    /**
    * Ciclos antes da remoção automática.
    * Configure-o para iniciar uma contagem regressiva, a cada ciclo de desenho que a propriedade é
    * reduzida em 1 unidade. Em 0, ele chamará um sprite.remove()
    * Desativado se definido como -1.
    *
    * @property life
    * @type {Number}
    * @default -1
    */
    this.life = -1;
  
    /**
    * Se definido como true, desenha um contorno do colisor, a profundidade e o centro.
    *
    * @property debug
    * @type {Boolean}
    * @default false
    */
    this.debug = false;
  
    /**
    * Se nenhuma imagem ou animação for definida, esta é a cor do
    * retângulo marcador
    *
    * @property shapeColor
    * @type {color}
    */
    this.shapeColor = color(127, 127, 127);
  
    /**
    * Grupos aos quais o sprite pertence, incluindo allSprites
    *
    * @property groups
    * @type {Array}
    */
    this.groups = [];
  
    var animations = {};
  
    // O rótulo da animação atual.
    var currentAnimation = '';
  
    /**
    * Referência à animação atual.
    *
    * @property animation
    * @type {Animation}
    */
    this.animation = undefined;
  
    /**
     * Colisor de varredura orientado ao longo do vetor de velocidade atual, estendendo-se para
     * cobrir as posições antigas e novas do sprite.
     *
     * Os cantos do colisor varrido se estenderão além da forma da varredura
     * real, mas deve ser suficiente para a detecção de fase ampla de candidatos
     * a colisão.
     *
     * Observe que este colisor não terá dimensões se o sprite de origem não tiver
     * velocidade.
     */
    this._sweptCollider = undefined;
  
    /**
    * Sprite posição x (alias para position.x).
    *
    * @property x
    * @type {Number}
    */
    Object.defineProperty(this, 'x', {
      enumerable: true,
      get: function() {
        return this.position.x;
      },
      set: function(value) {
        this.position.x = value;
      }
    });
  
    /**
    * Sprite posição y (alias para position.y).
    *
    * @property y
    * @type {Number}
    */
    Object.defineProperty(this, 'y', {
      enumerable: true,
      get: function() {
        return this.position.y;
      },
      set: function(value) {
        this.position.y = value;
      }
    });
  
    /**
    * Sprite velocidade x (alias para velocity.x).
    *
    * @property velocityX
    * @type {Number}
    */
    Object.defineProperty(this, 'velocityX', {
      enumerable: true,
      get: function() {
        return this.velocity.x;
      },
      set: function(value) {
        this.velocity.x = value;
      }
    });
  
    /**
    * Sprite velocidade y (alias para velocity.y).
    *
    * @property velocityY
    * @type {Number}
    */
    Object.defineProperty(this, 'velocityY', {
      enumerable: true,
      get: function() {
        return this.velocity.y;
      },
      set: function(value) {
        this.velocity.y = value;
      }
    });
  
    /**
    * Sprite tempo de vida (alias para vida).
    *
    * @property lifetime
    * @type {Number}
    */
    Object.defineProperty(this, 'lifetime', {
      enumerable: true,
      get: function() {
        return this.life;
      },
      set: function(value) {
        this.life = value;
      }
    });
  
    /**
    * Sprite elasticidade (alias para restituição).
    *
    * @property bounciness
    * @type {Number}
    */
    Object.defineProperty(this, 'bounciness', {
      enumerable: true,
      get: function() {
        return this.restitution;
      },
      set: function(value) {
        this.restitution = value;
      }
    });
  
    /**
    * Atraso de quadro de animação Sprite (alias para animation.frameDelay).
    *
    * @property frameDelay
    * @type {Number}
    */
    Object.defineProperty(this, 'frameDelay', {
      enumerable: true,
      get: function() {
        return this.animation && this.animation.frameDelay;
      },
      set: function(value) {
        if (this.animation) {
          this.animation.frameDelay = value;
        }
      }
    });
  
    /**
     * Se o sprite estiver se movendo, use o colisor de varredura. Caso contrário, use o real
     * colisor.
     */
    this._getBroadPhaseCollider = function() {
      return (this.velocity.magSq() > 0) ? this._sweptCollider : this.collider;
    };
  
    /**
     * Retorna true se os dois sprites se cruzaram no quadro atual,
     * indicando uma possível colisão.
     */
    this._doSweptCollidersOverlap = function(target) {
      var displacement = this._getBroadPhaseCollider().collide(target._getBroadPhaseCollider());
      return displacement.x !== 0 || displacement.y !== 0;
    };
  
    /*
     * @private
     * Mantenha as propriedades da animação em sincronia com a forma como a animação muda.
     */
    this._syncAnimationSizes = function(animations, currentAnimation) {
      if (pInst._fixedSpriteAnimationFrameSizes) {
        return;
      }
      if(animations[currentAnimation].frameChanged || this.width === undefined || this.height === undefined)
      {
        this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
        this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
      }
    };
  
    /**
    * Atualizar o sprite.
    * Chamado automaticamente no início do ciclo de sorteio.
    *
    * @method update
    */
    this.update = function() {
  
      if(!this.removed)
      {
        if (this._sweptCollider && this.velocity.magSq() > 0) {
          this._sweptCollider.updateSweptColliderFromSprite(this);
        }
  
        //se houve uma mudança em algum lugar após a última atualização
        //a posição antiga é a última posição registrada na atualização
        if(this.newPosition !== this.position)
          this.previousPosition = createVector(this.newPosition.x, this.newPosition.y);
        else
          this.previousPosition = createVector(this.position.x, this.position.y);
  
        this.velocity.x *= 1 - this.friction;
        this.velocity.y *= 1 - this.friction;
  
        if(this.maxSpeed !== -1)
          this.limitSpeed(this.maxSpeed);
  
        if(this.rotateToDirection && this.velocity.mag() > 0)
          this._rotation = this.getDirection();
  
        this.rotation += this.rotationSpeed;
  
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
  
        this.newPosition = createVector(this.position.x, this.position.y);
  
        this.deltaX = this.position.x - this.previousPosition.x;
        this.deltaY = this.position.y - this.previousPosition.y;
  
        //se houver uma animação
        if(animations[currentAnimation])
        {
          //atualizar isso
          animations[currentAnimation].update();
  
          this._syncAnimationSizes(animations, currentAnimation);
        }
  
        // um colisor é criado manualmente com setCollider ou
        // quando eu verifico este sprite para colisões ou sobreposições
        if (this.collider) {
          this.collider.updateFromSprite(this);
        }
  
        //ações do mouse
        if (this.mouseActive)
        {
          //se nenhum colisor defini-lo
            if(!this.collider)
              this.setDefaultCollider();
  
          this.mouseUpdate();
        }
        else
        {
          if (typeof(this.onMouseOver) === 'function' ||
              typeof(this.onMouseOut) === 'function' ||
              typeof(this.onMousePressed) === 'function' ||
              typeof(this.onMouseReleased) === 'function')
          {
            //se uma função do mouse for definida
            //está implícito que queremos ter o mouse ativo para
            //fazemos isso automaticamente
            this.mouseActive = true;
  
            //se nenhum colisor defini-lo
            if(!this.collider)
              this.setDefaultCollider();
  
            this.mouseUpdate();
          }
        }
  
        //contagem regressiva de autodestruição
        if (this.life>0)
          this.life--;
        if (this.life === 0)
          this.remove();
      }
    };//fim da atualização
  
    /**
     * Cria um colisor padrão correspondendo ao tamanho do
     * marcador retângulo ou a caixa delimitadora da imagem.
     *
     * @method setDefaultCollider
     */
    this.setDefaultCollider = function() {
      if(animations[currentAnimation] && animations[currentAnimation].getWidth() === 1 && animations[currentAnimation].getHeight() === 1) {
        //animação ainda está carregando
        return;
      }
      this.setCollider('rectangle');
    };
  
    /**
     * Atualiza o sprite de estados do mouse e aciona os eventos do mouse:
     * onMouseOver, onMouseOut, onMousePressed, onMouseReleased
     *
     * @method mouseUpdate
     */
    this.mouseUpdate = function() {
      var mouseWasOver = this.mouseIsOver;
      var mouseWasPressed = this.mouseIsPressed;
  
      this.mouseIsOver = false;
      this.mouseIsPressed = false;
  
      //rolar
      if(this.collider) {
        var mousePosition;
  
        if(camera.active)
          mousePosition = createVector(camera.mouseX, camera.mouseY);
        else
          mousePosition = createVector(pInst.mouseX, pInst.mouseY);
  
        this.mouseIsOver = this.collider.overlap(new p5.PointCollider(mousePosition));
  
        //var p5 global
        if(this.mouseIsOver && (pInst.mouseIsPressed || pInst.touchIsDown))
          this.mouseIsPressed = true;
  
        //mudança de evento - funções de chamada
        if(!mouseWasOver && this.mouseIsOver && this.onMouseOver !== undefined)
          if(typeof(this.onMouseOver) === 'function')
            this.onMouseOver.call(this, this);
          else
            print('Warning: onMouseOver should be a function');
  
        if(mouseWasOver && !this.mouseIsOver && this.onMouseOut !== undefined)
          if(typeof(this.onMouseOut) === 'function')
            this.onMouseOut.call(this, this);
          else
            print('Warning: onMouseOut should be a function');
  
        if(!mouseWasPressed && this.mouseIsPressed && this.onMousePressed !== undefined)
          if(typeof(this.onMousePressed) === 'function')
            this.onMousePressed.call(this, this);
          else
            print('Warning: onMousePressed should be a function');
  
        if(mouseWasPressed && !pInst.mouseIsPressed && !this.mouseIsPressed && this.onMouseReleased !== undefined)
          if(typeof(this.onMouseReleased) === 'function')
            this.onMouseReleased.call(this, this);
          else
            print('Warning: onMouseReleased should be a function');
  
      }
    };
  
    /**
    * Define um colisor para o sprite.
    *
    * Em p5.play, um colisor é um círculo ou retângulo invisível
    * que pode ter qualquer tamanho ou posição em relação ao sprite e qual
    * será usado para detectar colisões e sobreposição com outros sprites,
    * ou o cursor do mouse.
    *
    * Se o sprite estiver marcado para eventos de colisão, salto, sobreposição ou mouse
    * um colisor retangular é criado automaticamente a partir do parâmetro de largura e altura
    * passado na criação do sprite ou da dimensão
    * da imagem no caso de sprites animados.
    *
    * Freqüentemente, a caixa delimitadora da imagem não é apropriada como área ativa para
    * detecção de colisão para que você possa definir um sprite circular ou retangular com
    * dimensões diferentes e deslocamento do centro do sprite.
    *
    * Existem muitas maneiras de chamar esse método. O primeiro argumento determina o
    * tipo de colisor que você está criando, que por sua vez altera o restante
    * dos argumentos. Os tipos de colisor válidos são:
    *
    * * `point` - Um colisor de ponto sem dimensões, apenas uma posição.
    *
    *   `setCollider("point"[, offsetX, offsetY])`
    *
    * * `circle` - Um colisor circular com um raio definido.
    *
    *   `setCollider("circle"[, offsetX, offsetY[, radius])`
    *
    * * `rectangle` - Um alias para `aabb`, abaixo.
    *
    * * `aabb` - Uma caixa delimitadora alinhada ao eixo - tem largura e altura, mas sem rotação.
    *
    *   `setCollider("aabb"[, offsetX, offsetY[, width, height]])`
    *
    * * `obb` - Uma caixa delimitadora orientada - tem largura, altura e rotação.
    *
    *   `setCollider("obb"[, offsetX, offsetY[, width, height[, rotation]]])`
    *
    *
    * @method setCollider
    * @param {String} type Um de "point", "circle", "rectangle", "aabb" ou "obb"
    * @param {Number} [offsetX] Posição do colisor x a partir do centro do sprite
    * @param {Number} [offsetY] Posição do colisor y a partir do centro do sprite
    * @param {Number} [width] Largura ou raio do colisor
    * @param {Number} [height] Altura do colisor
    * @param {Number} [rotation] Rotação do colisor em graus
    * @throws {TypeError} se forem fornecidos parâmetros inválidos.
    */
    this.setCollider = function(type, offsetX, offsetY, width, height, rotation) {
      var _type = type ? type.toLowerCase() : '';
      if (_type === 'rectangle') {
        // Mapeie 'retângulo' para AABB. Altere isso se quiser que o padrão seja OBB.
        _type = 'obb';
      }
  
      // Verifique os argumentos corretos e forneça uma mensagem de uso sensível ao contexto, se estiver errado.
      if (!(_type === 'point' || _type === 'circle' || _type === 'obb' || _type === 'aabb')) {
        throw new TypeError('setCollider expects the first argument to be one of "point", "circle", "rectangle", "aabb" or "obb"');
      } else if (_type === 'point' && !(arguments.length === 1 || arguments.length === 3)) {
        throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY])');
      } else if (_type === 'circle' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 4)) {
        throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, radius]])');
      } else if (_type === 'aabb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5)) {
        throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height]])');
      } else if (_type === 'obb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5 || arguments.length === 6)) {
        throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height[, rotation]]])');
      }
  
      //var center = this.position;
      var offset = createVector(offsetX, offsetY);
  
      if (_type === 'point') {
        this.collider = p5.PointCollider.createFromSprite(this, offset);
      } else if (_type === 'circle') {
        this.collider = p5.CircleCollider.createFromSprite(this, offset, width);
      } else if (_type === 'aabb') {
        this.collider = p5.AxisAlignedBoundingBoxCollider.createFromSprite(this, offset, width, height);
      } else if (_type === 'obb') {
        this.collider = p5.OrientedBoundingBoxCollider.createFromSprite(this, offset, width, height, radians(rotation));
      }
  
      this._sweptCollider = new p5.OrientedBoundingBoxCollider();
  
      // Desativado para Code.org, já que o perf parece melhor sem o quadtree:
      // quadTree.insert(this);
    };
  
    /**
    * Define o espelhamento horizontal do sprite.
    * Se 1 as imagens são exibidas normalmente
    * Se -1 as imagens são invertidas horizontalmente
    * Se nenhum argumento retorna o espelhamento x atual
    *
    * @method mirrorX
    * @param {Number} dir Ou 1 ou -1
    * @return {Number} Espelhamento atual se nenhum parâmetro for especificado
    */
    this.mirrorX = function(dir) {
      if(dir === 1 || dir === -1)
        dirX = dir;
      else
        return dirX;
    };
  
    /**
    * Define o espelhamento vertical do sprite.
    * Se 1 as imagens são exibidas normalmente
    * Se -1 as imagens são invertidas verticalmente
    * Se nenhum argumento retorna o espelhamento x atual
    *
    * @method mirrorY
    * @param {Number} dir Ou 1 ou -1
    * @return {Number} Espelhamento atual se nenhum parâmetro for especificado
    */
    this.mirrorY = function(dir) {
      if(dir === 1 || dir === -1)
        dirY = dir;
      else
        return dirY;
    };
  
    /*
     * Retorna o valor que o sprite deve ser escalado na direção X.
     * Usado para calcular renderização e colisões.
     * Quando _fixedSpriteAnimationFrameSizes é definido, o valor da escala deve
     * incluir o alongamento horizontal para animações.
     * @private
     */
    this._getScaleX = function()
    {
      if (pInst._fixedSpriteAnimationFrameSizes) {
        return this.scale * this._horizontalStretch;
      }
      return this.scale;
    };
  
    /*
     * Retorna o valor que o sprite deve ser escalado na direção Y.
     * Usado para calcular renderização e colisões.
     * Quando _fixedSpriteAnimationFrameSizes é definido, o valor da escala deve
     * incluir o alongamento vertical para animações.
     * @private
     */
    this._getScaleY = function()
    {
      if (pInst._fixedSpriteAnimationFrameSizes) {
        return this.scale * this._verticalStretch;
      }
      return this.scale;
    };
  
    /**
     * Gerencia o posicionamento, escala e rotação do sprite
     * Chamado automaticamente, não deve ser substituído
     * @private
     * @final
     * @method display
     */
    this.display = function()
    {
      if (this.visible && !this.removed)
      {
        push();
        colorMode(RGB);
  
        noStroke();
        rectMode(CENTER);
        ellipseMode(CENTER);
        imageMode(CENTER);
  
        translate(this.position.x, this.position.y);
        if (pInst._angleMode === pInst.RADIANS) {
          rotate(radians(this.rotation));
        } else {
          rotate(this.rotation);
        }
        scale(this._getScaleX()*dirX, this._getScaleY()*dirY);
        this.draw();
        //ddesenhar informações de depuração
        pop();
  
  
        if(this.debug)
        {
          push();
          //desenhe o ponto de ancoragem
          stroke(0, 255, 0);
          strokeWeight(1);
          line(this.position.x-10, this.position.y, this.position.x+10, this.position.y);
          line(this.position.x, this.position.y-10, this.position.x, this.position.y+10);
          noFill();
  
          //número de profundidade
          noStroke();
          fill(0, 255, 0);
          textAlign(LEFT, BOTTOM);
          textSize(16);
          text(this.depth+'', this.position.x+4, this.position.y-2);
  
          noFill();
          stroke(0, 255, 0);
  
          // Desenhar forma de colisão
          if (this.collider === undefined) {
            this.setDefaultCollider();
          }
          if(this.collider) {
            this.collider.draw(pInst);
          }
          pop();
        }
  
      }
    };
  
  
    /**
    * Gerencia o visual do sprite.
    * Ele pode ser substituído por uma função de desenho personalizada.
    * O ponto 0,0 será o centro do sprite.
    * Exemplo:
    * sprite.draw = function() { ellipse(0,0,10,10) }
    * Irá exibir o sprite como um círculo.
    *
    * @method draw
    */
    this.draw = function()
    {
      if(currentAnimation !== '' && animations)
      {
        if(animations[currentAnimation]) {
          if(this.tint) {
            push();
            tint(this.tint);
          }
          animations[currentAnimation].draw(0, 0, 0);
          if(this.tint) {
            pop();
          }
        }
      }
      else
      {
        var fillColor = this.shapeColor;
        if (this.tint) {
          fillColor = lerpColor(color(fillColor), color(this.tint), 0.5);
        }
        noStroke();
        fill(fillColor);
        rect(0, 0, this._internalWidth, this._internalHeight);
      }
    };
  
    /**
     * Remove o Sprite do sketch.
     * O Sprite removido não será mais desenhado ou atualizado.
     *
     * @method remove
     */
    this.remove = function() {
      this.removed = true;
  
      quadTree.removeObject(this);
  
      //quando removido da "cena" também remove todas as referências em todos os grupos
      while (this.groups.length > 0) {
        this.groups[0].remove(this);
      }
    };
  
    /**
     * Alias para <a href='#method-remove'>remove()</a>
     *
     * @method destroy
     */
    this.destroy = this.remove;
  
    /**
    * Define o vetor de velocidade.
    *
    * @method setVelocity
    * @param {Number} x Componente X
    * @param {Number} y Componente Y
    */
    this.setVelocity = function(x, y) {
      this.velocity.x = x;
      this.velocity.y = y;
    };
  
    /**
    * Calcula a velocidade escalar.
    *
    * @method getSpeed
    * @return {Number} Velocidade escalar
    */
    this.getSpeed = function() {
      return this.velocity.mag();
    };
  
    /**
    * Calcula a direção do movimento em graus.
    *
    * @method getDirection
    * @return {Number} Ângulo em graus
    */
    this.getDirection = function() {
  
      var direction = atan2(this.velocity.y, this.velocity.x);
  
      if(isNaN(direction))
        direction = 0;
  
      // Ao contrário de Math.atan2, o método atan2 acima retornará para graus se
      // o anguloMode p5 atual for ÂNGULOS, e radianos se o anguloMode p5 for
      // RADIANOS.  Este método sempre deve retornar graus (por enquanto).
      // Veja https://github.com/molleindustria/p5.play/issues/94
      if (pInst._angleMode === pInst.RADIANS) {
        direction = degrees(direction);
      }
  
      return direction;
    };
  
    /**
    * Adiciona o sprite a um grupo existente
    *
    * @method addToGroup
    * @param {Object} group
    */
    this.addToGroup = function(group) {
      if(group instanceof Array)
        group.add(this);
      else
        print('addToGroup error: '+group+' is not a group');
    };
  
    /**
    * Limita a velocidade escalar.
    *
    * @method limitSpeed
    * @param {Number} max Velocidade máxima: número positivo
    */
    this.limitSpeed = function(max) {
  
      //atualizar velocidade linear
      var speed = this.getSpeed();
  
      if(abs(speed)>max)
      {
        //encontrar fator de redução
        var k = max/abs(speed);
        this.velocity.x *= k;
        this.velocity.y *= k;
      }
    };
  
    /**
    * Defina a velocidade e direção do sprite.
    * A ação substitui a velocidade atual.
    * Se a direção não for fornecida, a direção atual será mantida.
    * Se a direção não for fornecida e não houver velocidade atual, a rotação
    * angular atual é usado para a direção.
    *
    * @method setSpeed
    * @param {Number}  speed Velocidade escalar
    * @param {Number}  [angle] Direção em graus
    */
    this.setSpeed = function(speed, angle) {
      var a;
      if (typeof angle === 'undefined') {
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
          a = pInst.atan2(this.velocity.y, this.velocity.x);
        } else {
          if (pInst._angleMode === pInst.RADIANS) {
            a = radians(this._rotation);
          } else {
            a = this._rotation;
          }
        }
      } else {
        if (pInst._angleMode === pInst.RADIANS) {
          a = radians(angle);
        } else {
          a = angle;
        }
      }
      this.velocity.x = cos(a)*speed;
      this.velocity.y = sin(a)*speed;
    };
  
    /**
     * Alias para <a href='#method-setSpeed'>setSpeed()</a>
     *
     * @method setSpeedAndDirection
     * @param {Number}  speed Velocidade escalar
     * @param {Number}  [angle] Direção em graus
     */
    this.setSpeedAndDirection = this.setSpeed;
  
    /**
    * Alias para <a href='Animation.html#method-changeFrame'>animation.changeFrame()</a>
    *
    * @method setFrame
    * @param {Number} frame Número do quadro (começa em 0).
    */
    this.setFrame = function(f) {
      if (this.animation) {
        this.animation.changeFrame(f);
      }
    };
  
    /**
    * Alias para <a href='Animation.html#method-nextFrame'>animation.nextFrame()</a>
    *
    * @method nextFrame
    */
    this.nextFrame = function() {
      if (this.animation) {
        this.animation.nextFrame();
      }
    };
  
    /**
    * Alias para <a href='Animation.html#method-previousFrame'>animation.previousFrame()</a>
    *
    * @method previousFrame
    */
    this.previousFrame = function() {
      if (this.animation) {
        this.animation.previousFrame();
      }
    };
  
    /**
    * Alias para <a href='Animation.html#method-stop'>animation.stop()</a>
    *
    * @method pause
    */
    this.pause = function() {
      if (this.animation) {
        this.animation.stop();
      }
    };
  
    /**
     * Alias para <a href='Animation.html#method-play'>animation.play()</a> with extra logic
     *
     * Reproduz/retoma a animação atual do sprite.
     * Se a animação estiver sendo reproduzida, isso não terá efeito.
     * Se a animação parou em seu último quadro, isso irá reiniciá-la
     * no inicio.
     *
     * @method play
     */
    this.play = function() {
      if (!this.animation) {
        return;
      }
      // Normalmente, isso apenas define o sinalizador de 'reprodução' sem alterar o quadro
      // de animação, que fará com que a animação continue no próximo update().
      // Se a animação não estiver em loop e for interrompida no último quadro
      // também retrocedemos a animação para o início.
      if (!this.animation.looping && !this.animation.playing && this.animation.getFrame() === this.animation.images.length - 1) {
        this.animation.rewind();
      }
      this.animation.play();
    };
  
    /**
     * Wrapper para acessar <a href='Animation.html#prop-frameChanged'>animation.frameChanged</a>
     *
     * @method frameDidChange
     * @return {Boolean} true se o quadro da animação mudou
     */
    this.frameDidChange = function() {
      return this.animation ? this.animation.frameChanged : false;
    };
  
    /**
    * Rotate the sprite towards a specific position
    *
    * @method setFrame
    * @param {Number} x Coordenada horizontal para apontar para
    * @param {Number} y Coordenada vertical para apontar para
    */
    this.pointTo = function(x, y) {
      var yDelta = y - this.position.y;
      var xDelta = x - this.position.x;
      if (!isNaN(xDelta) && !isNaN(yDelta) && (xDelta !== 0 || yDelta !== 0)) {
        var radiansAngle = Math.atan2(yDelta, xDelta);
        this.rotation = 360 * radiansAngle / (2 * Math.PI);
      }
    };
  
    /**
    * Empurra o sprite em uma direção definida por um ângulo.
    * A força é adicionada à velocidade atual.
    *
    * @method addSpeed
    * @param {Number}  speed Velocidade escalar para adicionar
    * @param {Number}  angle Direção em graus
    */
    this.addSpeed = function(speed, angle) {
      var a;
      if (pInst._angleMode === pInst.RADIANS) {
        a = radians(angle);
      } else {
        a = angle;
      }
      this.velocity.x += cos(a) * speed;
      this.velocity.y += sin(a) * speed;
    };
  
    /**
    * Empurra o sprite em direção a um ponto.
    * A força é adicionada à velocidade atual.
    *
    * @method attractionPoint
    * @param {Number}  magnitude Velocidade escalar para adicionar
    * @param {Number}  pointX Coordenada de direção x
    * @param {Number}  pointY Coordenada de direção y
    */
    this.attractionPoint = function(magnitude, pointX, pointY) {
      var angle = atan2(pointY-this.position.y, pointX-this.position.x);
      this.velocity.x += cos(angle) * magnitude;
      this.velocity.y += sin(angle) * magnitude;
    };
  
  
    /**
    * Adiciona uma imagem ao sprite.
    * Uma imagem será considerada uma animação de um quadro.
    * A imagem deve ser pré-carregada na função preload() usando p5 loadImage.
    * As animações requerem um rótulo de identificação (string) para alterá-las.
    * A imagem é armazenada no sprite, mas não necessariamente exibida
    * até que Sprite.changeAnimation(label) seja chamado
    *
    * Usos:
    * - sprite.addImage(label, image);
    * - sprite.addImage(image);
    *
    * Se apenas uma imagem for passada, nenhum rótulo é especificado
    *
    * @method addImage
    * @param {String|p5.Image} label Rótulo ou imagem
    * @param {p5.Image} [img] Imagem
    */
    this.addImage = function()
    {
      if(typeof arguments[0] === 'string' && arguments[1] instanceof p5.Image)
        this.addAnimation(arguments[0], arguments[1]);
      else if(arguments[0] instanceof p5.Image)
        this.addAnimation('normal', arguments[0]);
      else
        throw('addImage error: allowed usages are <image> or <label>, <image>');
    };
  
    /**
    * Adiciona uma imagem ao sprite
    * A animação deve ser pré-carregada na função preload() usando loadAnimation.
    * Animações requerem um rótulo de identificação (string) para alterá-las.
    * Animações são armazenada no sprite, mas não necessariamente exibidas
    * até que Sprite.changeAnimation (label) seja chamado
    *
    * Uso:
    * - sprite.addAnimation(label, animation);
    *
    * Usos alternativos. Consulte Animação para obter mais informações sobre sequências de arquivos:
    * - sprite.addAnimation(label, firstFrame, lastFrame);
    * - sprite.addAnimation(label, frame1, frame2, frame3...);
    *
    * @method addAnimation
    * @param {String} label Identificador de animação
    * @param {Animation} animation A animação pré-carregada
    */
    this.addAnimation = function(label)
    {
      var anim;
  
      if(typeof label !== 'string')
      {
        print('Sprite.addAnimation error: the first argument must be a label (String)');
        return -1;
      }
      else if(arguments.length < 2)
      {
        print('addAnimation error: you must specify a label and n frame images');
        return -1;
      }
      else if(arguments[1] instanceof Animation)
      {
  
        var sourceAnimation = arguments[1];
  
        var newAnimation = sourceAnimation.clone();
  
        animations[label] = newAnimation;
  
        if(currentAnimation === '')
        {
          currentAnimation = label;
          this.animation = newAnimation;
        }
  
        newAnimation.isSpriteAnimation = true;
  
        this._internalWidth = newAnimation.getWidth()*abs(this._getScaleX());
        this._internalHeight = newAnimation.getHeight()*abs(this._getScaleY());
  
        return newAnimation;
      }
      else
      {
        var animFrames = [];
        for(var i=1; i<arguments.length; i++)
          animFrames.push(arguments[i]);
  
        anim = construct(pInst.Animation, animFrames);
        animations[label] = anim;
  
        if(currentAnimation === '')
        {
          currentAnimation = label;
          this.animation = anim;
        }
        anim.isSpriteAnimation = true;
  
        this._internalWidth = anim.getWidth()*abs(this._getScaleX());
        this._internalHeight = anim.getHeight()*abs(this._getScaleY());
  
        return anim;
      }
  
    };
  
    /**
    * Altera a imagem/animação exibida.
    * Equivalente a changeAnimation
    *
    * @method changeImage
    * @param {String} label Identificador de imagem/animação
    */
    this.changeImage = function(label) {
      this.changeAnimation(label);
    };
  
     /**
    * Retorna o rótulo da animação atual
    *
    * @method getAnimationLabel
    * @return {String} label Identificador de imagem/animação
    */
    this.getAnimationLabel = function() {
      return currentAnimation;
    };
  
    /**
    * Altera a animação exibida.
    * Veja Animação para mais controle sobre a sequência.
    *
    * @method changeAnimation
    * @param {String} label identificador de animação
    */
    this.changeAnimation = function(label) {
      if(!animations[label])
        print('changeAnimation error: no animation labeled '+label);
      else
      {
        currentAnimation = label;
        this.animation = animations[label];
      }
    };
  
    /**
    * Define a animação de uma lista em _predefinedSpriteAnimations.
    *
    * @method setAnimation
    * @private
    * @param {String} label identificador de animação
    */
    this.setAnimation = function(animationName) {
      if (animationName === this.getAnimationLabel()) {
        return;
      }
  
      var animation = pInst._predefinedSpriteAnimations &&
          pInst._predefinedSpriteAnimations[animationName];
      if (typeof animation === 'undefined') {
        throw new Error('Unable to find an animation named "' + animationName +
            '".  Please make sure the animation exists.');
      }
      this.addAnimation(animationName, animation);
      this.changeAnimation(animationName);
      if (pInst._pauseSpriteAnimationsByDefault) {
        this.pause();
      }
    };
  
    /**
    * Verifica se o ponto dado corresponde a um pixel transparente
    * na imagem atual do sprite. Pode ser usado para verificar um ponto de colisão
    * contra apenas a parte visível do sprite.
    *
    * @method overlapPixel
    * @param {Number} pointX coordenada x do ponto a verificar
    * @param {Number} pointY coordenada y do ponto a verificar
    * @return {Boolean} result Verdadeiro se não transparente
    */
    this.overlapPixel = function(pointX, pointY) {
      var point = createVector(pointX, pointY);
  
      var img = this.animation.getFrameImage();
  
      //converter ponto para posição relativa da imagem
      point.x -= this.position.x-img.width/2;
      point.y -= this.position.y-img.height/2;
  
      //totalmente fora da imagem
      if(point.x<0 || point.x>img.width || point.y<0 || point.y>img.height)
        return false;
      else if(this.rotation === 0 && this.scale === 1)
      {
        //verdadeiro se opacidade total
        var values = img.get(point.x, point.y);
        return values[3] === 255;
      }
      else
      {
        print('Error: overlapPixel doesn\'t work with scaled or rotated sprites yet');
        //impressão fora da tela a ser implementada bleurch
        return false;
      }
    };
  
    /**
    * Verifica se o ponto dado está dentro do colisor do sprite.
    *
    * @method overlapPoint
    * @param {Number} pointX coordenada x do ponto a verificar
    * @param {Number} pointY coordenada y do ponto a verificar
    * @return {Boolean} result Verdadeiro se dentro
    */
    this.overlapPoint = function(pointX, pointY) {
      if(!this.collider)
        this.setDefaultCollider();
  
      if(this.collider) {
        var point = new p5.PointCollider(new p5.Vector(pointX, pointY));
        return this.collider.overlap(point);
      }
      return false;
    };
  
  
    /**
    * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos,
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * Se o alvo for um grupo, a função será chamada para cada um
    * sobreposição de sprites. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     sprite.overlap(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method overlap
    * @param {Object} target Sprite ou grupo para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobreposto
    */
    this.overlap = function(target, callback) {
      return this._collideWith('overlap', target, callback);
    };
  
    /**
     * Alias para <a href='#method-overlap'>overlap()</a>, exceto sem um
     * parâmetro de retorno de chamada.
     * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos,
     * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
     *
     * Retorna se este sprite está ou não sobrepondo outro sprite
     * ou grupo. Modifica o objeto de propriedade de toque do sprite.
     *
     * @method isTouching
     * @param {Object} target Sprite ou grupo para comparar com o atual
     * @return {Boolean} True se tocando
     */
    this.isTouching = this.overlap;
  
    /**
    * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
    * Se a sobreposição for positiva, o sprite irá pular com o(s) alvo(s)
    * tratado como imóvel com coeficiente de restituição zero.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a colisão.
    * Se o alvo for um grupo, a função será chamada para cada
    * Sprite colidindo. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     sprite.collide(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method collide
    * @param {Object} target Sprite ou grupo para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobreposto
    */
    this.collide = function(target, callback) {
      return this._collideWith('collide', target, callback);
    };
  
    /**
    * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
    * Se a sobreposição for positiva, o sprite atual irá deslocar
    * o que está colidindo para a posição não sobreposta mais próxima.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a colisão.
    * Se o alvo for um grupo, a função será chamada para cada
    * Sprite colidindo. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     sprite.displace(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method displace
    * @param {Object} target Sprite ou grupo para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobreposto
    */
    this.displace = function(target, callback) {
      return this._collideWith('displace', target, callback);
    };
  
    /**
    * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
    * Se a sobreposição for positiva, os sprites irão pular afetando todas as
    * outras trajetórias, dependendo de sua .velocity .mass e .restitution
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a colisão.
    * Se o alvo for um grupo, a função será chamada para cada
    * Sprite colidindo. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     sprite.bounce(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method bounce
    * @param {Object} target Sprite ou grupo para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobreposto
    */
    this.bounce = function(target, callback) {
      return this._collideWith('bounce', target, callback);
    };
  
    /**
    * Verifica se o sprite está se sobrepondo a outro sprite ou grupo.
    * Se a sobreposição for positiva, o sprite irá pular com o(s) alvo(s)
    * tratado como imóvel.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a colisão.
    * Se o alvo for um grupo, a função será chamada para cada
    * Sprite colidindo. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     sprite.bounceOff(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method bounceOff
    * @param {Object} target Sprite ou grupo para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobreposto
    */
    this.bounceOff = function(target, callback) {
      return this._collideWith('bounceOff', target, callback);
    };
  
    /**
     * Função de detecção de colisão interna. Não use diretamente.
     *
     * Lida com a colisão com sprites individuais ou com grupos, usando o
     * quadtree para otimizar o último.
     *
     * @method _collideWith
     * @private
     * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
     *   'bounce' ou 'bounceOff'
     * @param {Sprite|Group} target
     * @param {function} callback - se a colisão ocorreu (ignorado para 'isTouching')
     * @return {boolean} true se uma colisão ocorreu
     */
    this._collideWith = function(type, target, callback) {
      this.touching.left = false;
      this.touching.right = false;
      this.touching.top = false;
      this.touching.bottom = false;
  
      if (this.removed) {
        return false;
      }
  
      var others = [];
  
      if (target instanceof Sprite) {
        others.push(target);
      } else if (target instanceof Array) {
        if (pInst.quadTree !== undefined && pInst.quadTree.active) {
          others = pInst.quadTree.retrieveFromGroup(this, target);
        }
  
        // Se o quadtree estiver desabilitado - ou - nenhum sprite neste grupo está no
        // quadtree ainda (porque seus colisores padrões não foram criados)
        // devemos apenas verificar todos eles.
        if (others.length === 0) {
          others = target;
        }
      } else {
        throw('Error: overlap can only be checked between sprites or groups');
      }
  
      var result = false;
      for(var i = 0; i < others.length; i++) {
        result = this._collideWithOne(type, others[i], callback) || result;
      }
      return result;
    };
  
    /**
     * Método de colisão auxiliar para colidir este sprite com outro sprite.
     *
     * Tem o efeito colateral de definir essas propriedades de toque como TRUE se colisões
     * ocorrerem.
     *
     * @method _collideWithOne
     * @private
     * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
     *   'bounce' ou 'bounceOff'
     * @param {Sprite} other
     * @param {function} callback - se a colisão ocorreu (ignorado para 'isTouching')
     * @return {boolean} true se uma colisão ocorreu
     */
    this._collideWithOne = function(type, other, callback) {
      // Nunca colide consigo mesmo
      if (other === this || other.removed) {
        return false;
      }
  
      if (this.collider === undefined) {
        this.setDefaultCollider();
      }
  
      if (other.collider === undefined) {
        other.setDefaultCollider();
      }
  
      if (!this.collider || !other.collider) {
        // Não foi possível criar um colisor para um dos sprites.
        // Isso geralmente significa que sua animação ainda não está disponível; Será em breve.
        // Não colidir agora.
        return false;
      }
  
      // Na verdade, calcule a sobreposição dos dois aceleradores
      var displacement = this._findDisplacement(other);
      if (displacement.x === 0 && displacement.y === 0) {
        // Esses sprites não se sobrepõem.
        return false;
      }
  
      if (displacement.x > 0)
        this.touching.left = true;
      if (displacement.x < 0)
        this.touching.right = true;
      if (displacement.y < 0)
        this.touching.bottom = true;
      if (displacement.y > 0)
        this.touching.top = true;
  
      // Aplicar deslocamento fora da colisão
      if (type === 'displace' && !other.immovable) {
        other.position.sub(displacement);
      } else if ((type === 'collide' || type === 'bounce' || type === 'bounceOff') && !this.immovable) {
        this.position.add(displacement);
        this.previousPosition = createVector(this.position.x, this.position.y);
        this.newPosition = createVector(this.position.x, this.position.y);
        this.collider.updateFromSprite(this);
      }
  
      // Crie comportamentos especiais para certos tipos de colisão ao substituir
      // temporariamente as propriedades de tipo e sprite.
      // Veja outro bloco próximo ao final deste método que os coloca de volta.
      var originalType = type;
      var originalThisImmovable = this.immovable;
      var originalOtherImmovable = other.immovable;
      var originalOtherRestitution = other.restitution;
      if (originalType === 'collide') {
        type = 'bounce';
        other.immovable = true;
        other.restitution = 0;
      } else if (originalType === 'bounceOff') {
        type = 'bounce';
        other.immovable = true;
      }
  
      // Se esta é uma colisão de 'salto', determine as novas velocidades para cada sprite
      if (type === 'bounce') {
        // Estamos preocupados apenas com as velocidades paralelas à normal de colisão,
        // então projete nossas velocidades de sprite naquele normal (capturado no
        // vetor de deslocamento) e use-os em todo o cálculo
        var thisInitialVelocity = p5.Vector.project(this.velocity, displacement);
        var otherInitialVelocity = p5.Vector.project(other.velocity, displacement);
  
        // Nós só nos importamos com os valores de massa relativa, então se um dos sprites
        // é considerado 'imóvel' trate a massa do _outro_ sprite como zero
        // para obter os resultados corretos.
        var thisMass = this.mass;
        var otherMass = other.mass;
        if (this.immovable) {
          thisMass = 1;
          otherMass = 0;
        } else if (other.immovable) {
          thisMass = 0;
          otherMass = 1;
        }
  
        var combinedMass = thisMass + otherMass;
        var coefficientOfRestitution = this.restitution * other.restitution;
        var initialMomentum = p5.Vector.add(
          p5.Vector.mult(thisInitialVelocity, thisMass),
          p5.Vector.mult(otherInitialVelocity, otherMass)
        );
        var thisFinalVelocity = p5.Vector.sub(otherInitialVelocity, thisInitialVelocity)
          .mult(otherMass * coefficientOfRestitution)
          .add(initialMomentum)
          .div(combinedMass);
        var otherFinalVelocity = p5.Vector.sub(thisInitialVelocity, otherInitialVelocity)
          .mult(thisMass * coefficientOfRestitution)
          .add(initialMomentum)
          .div(combinedMass);
        // Remova a velocidade antes e aplique a velocidade depois em ambos os membros.
        this.velocity.sub(thisInitialVelocity).add(thisFinalVelocity);
        other.velocity.sub(otherInitialVelocity).add(otherFinalVelocity);
      }
  
      // Restaure as propriedades do sprite agora que as mudanças de velocidade foram feitas.
      // Veja outro bloco antes das mudanças de velocidade que os configuram.
      type = originalType;
      this.immovable = originalThisImmovable;
      other.immovable = originalOtherImmovable;
      other.restitution = originalOtherRestitution;
  
      // Finalmente, para todos os tipos de colisão, exceto 'isTouching', chame o retorno
      // e registre a ocorrência da colisão.
      if (typeof callback === 'function' && type !== 'isTouching') {
        callback.call(this, this, other);
      }
      return true;
    };
  
    this._findDisplacement = function(target) {
      // Amostra múltipla se ocorrer tunelamento:
      // Faça a detecção de fase ampla. Verifique se os colisores varridos se sobrepõem.
      // Nesse caso, teste as interpolações entre suas últimas posições e suas
      // posições atuais, e verifique se há tunelamento dessa forma.
      // Use amostragem múltipla para capturar colisões que, de outra forma, poderíamos perder.
      if (this._doSweptCollidersOverlap(target)) {
        // Descubra quantas amostras devemos tirar.
        // Queremos limitar isso para não obter um número absurdo de amostras
        // quando os objetos acabam em velocidades muito altas (como acontece às vezes em
        // mecanismos de jogo).
        var radiusOnVelocityAxis = Math.max(
          this.collider._getMinRadius(),
          target.collider._getMinRadius());
        var relativeVelocity = p5.Vector.sub(this.velocity, target.velocity).mag();
        var timestep = Math.max(0.015, radiusOnVelocityAxis / relativeVelocity);
        // Se os objetos são pequenos o suficiente para se beneficiar da amostragem múltipla nesta
        // velocidade relativa
        if (timestep < 1) {
          // Mova os sprites de volta para as posições anteriores
          // (Nós saltamos alguns obstáculos aqui para evitar a criação de muitos novos
          // objetos vetoriais)
          var thisOriginalPosition = this.position.copy();
          var targetOriginalPosition = target.position.copy();
          this.position.set(this.previousPosition);
          target.position.set(target.previousPosition);
  
          // Escala deltas até os timestep-deltas
          var thisDelta = p5.Vector.sub(thisOriginalPosition, this.previousPosition).mult(timestep);
          var targetDelta = p5.Vector.sub(targetOriginalPosition, target.previousPosition).mult(timestep);
  
          // Nota: Não temos que verificar a posição original, podemos assumir que é
          // sem colisão (ou teria sido tratado no último quadro).
          for (var i = timestep; i < 1; i += timestep) {
            // Mova os sprites para frente pelo tempo do subquadro
            this.position.add(thisDelta);
            target.position.add(targetDelta);
            this.collider.updateFromSprite(this);
            target.collider.updateFromSprite(target);
  
            // Verifique se há colisão na nova posição da subestrutura
            var displacement = this.collider.collide(target.collider);
            if (displacement.x !== 0 || displacement.y !== 0) {
              // Esses sprites estão sobrepostos - temos um deslocamento e um
              // ponto no tempo para a colisão.
              // Se qualquer um dos sprites for imóvel, ele deve voltar a sua posição
              // final. Caso contrário, deixe os sprites em posições
              // interpoladas quando a colisão ocorreu.
              if (this.immovable) {
                this.position.set(thisOriginalPosition);
              }
  
              if (target.immovable) {
                target.position.set(targetOriginalPosition);
              }
  
              return displacement;
            }
          }
  
          // Se não encontramos um deslocamento no meio do caminho,
          // restaure os sprites às suas posições originais e volte
          // para fazer a verificação de colisão em sua posição final.
          this.position.set(thisOriginalPosition);
          target.position.set(targetOriginalPosition);
        }
      }
  
      // Certifique-se de que os colliders estejam devidamente atualizados para corresponder a seus
      // sprites mãe. Talvez um dia não tenhamos que fazer isso, mas por agora
      // sprites não têm garantia de consistência interna, fazemos uma
      // atualização de última hora para ter certeza.
      this.collider.updateFromSprite(this);
      target.collider.updateFromSprite(target);
  
      return this.collider.collide(target.collider);
    };
  } //fim da Classe Sprite
  
  defineLazyP5Property('Sprite', boundConstructorFactory(Sprite));
  
  /**
     * Uma câmera facilita a rolagem e o zoom para cenas que vão além
     * a tela. Uma câmera tem uma posição, um fator de zoom e as coordenadas
     * do mouse relativas à vista.
     * A câmera é criada automaticamente no primeiro ciclo de desenho.
     *
     * Em termos de p5.js, a câmera envolve todo o ciclo de desenho em uma
     * matriz de transformação, mas pode ser desativada a qualquer momento durante o ciclo
     * de desenho, por exemplo, para desenhar os elementos da interface em uma posição absoluta.
     *
     * @class Camera
     * @constructor
     * @param {Number} x Coordenada x inicial
     * @param {Number} y Coordenada y inicial
     * @param {Number} zoom ampliação
     **/
  function Camera(pInst, x, y, zoom) {
    /**
    * Posição da câmera. Define o deslocamento global do sketch.
    *
    * @property position
    * @type {p5.Vector}
    */
    this.position = pInst.createVector(x, y);
  
    /**
    * Posição da câmera x. Define o deslocamento global horizontal do sketch.
    *
    * @property x
    * @type {Number}
    */
    Object.defineProperty(this, 'x', {
      enumerable: true,
      get: function() {
        return this.position.x;
      },
      set: function(value) {
        this.position.x = value;
      }
    });
  
    /**
    * Posição da câmera y. Define o deslocamento global horizontal do sketch.
    *
    * @property y
    * @type {Number}
    */
    Object.defineProperty(this, 'y', {
      enumerable: true,
      get: function() {
        return this.position.y;
      },
      set: function(value) {
        this.position.y = value;
      }
    });
  
    /**
    * Zoom da câmera. Define a escala global do sketch.
    * Uma escala de 1 será o tamanho normal. Configurá-lo para 2 fará com que tudo
    * fique com duas vezes o tamanho. .5 fará com que tudo fique com a metade do tamanho.
    *
    * @property zoom
    * @type {Number}
    */
    this.zoom = zoom;
  
    /**
    * MouseX traduzido para a visão da câmera.
    * Deslocar e dimensionar a tela não mudará a posição dos sprites
    * nem as variáveis mouseX e mouseY. Use esta propriedade para ler a posição
    * do mouse, se a câmera se moveu ou ampliou.
    *
    * @property mouseX
    * @type {Number}
    */
    this.mouseX = pInst.mouseX;
  
    /**
    * MouseY traduzido para a visão da câmera.
    * Deslocar e dimensionar a tela não mudará a posição dos sprites
    * nem as variáveis mouseX e mouseY. Use esta propriedade para ler a posição
    * do mouse, se a câmera se moveu ou ampliou.
    *
    * @property mouseY
    * @type {Number}
    */
    this.mouseY = pInst.mouseY;
  
    /**
    * Verdadeiro se a câmera estiver ativa.
    * Propriedade somente de leitura. Use os métodos Camera.on() e Camera.off()
    * para ativar ou desativar a câmera.
    *
    * @property active
    * @type {Boolean}
    */
    this.active = false;
  
    /**
    * Verifique se a câmera está ativa.
    * Use os métodos Camera.on() e Camera.off()
    * para ativar ou desativar a câmera.
    *
    * @method isActive
    * @return {Boolean} verdadeiro se a câmera estiver ativa
    */
    this.isActive = function() {
      return this.active;
    };
  
    /**
    * Ativa a câmera.
    * A tela será desenhada de acordo com a posição da câmera e escala até
    * Camera.off() ser chamado
    *
    * @method on
    */
    this.on = function() {
      if(!this.active)
      {
        cameraPush.call(pInst);
        this.active = true;
      }
    };
  
    /**
    * Desativa a câmera.
    * A tela será desenhada normalmente, ignorando a posição da câmera
    * e dimensão até que Camera.on() seja chamado
    *
    * @method off
    */
    this.off = function() {
      if(this.active)
      {
        cameraPop.call(pInst);
        this.active = false;
      }
    };
  } //fim da Classe Camera
  
  defineLazyP5Property('Camera', boundConstructorFactory(Camera));
  
  //chamado pre desenho por padrão
  function cameraPush() {
    var pInst = this;
    var camera = pInst.camera;
  
    //estranho, mas necessário para ter a câmera no centro
    // da tela por padrão
    if(!camera.init && camera.position.x === 0 && camera.position.y === 0)
      {
      camera.position.x=pInst.width/2;
      camera.position.y=pInst.height/2;
      camera.init = true;
      }
  
    camera.mouseX = pInst.mouseX+camera.position.x-pInst.width/2;
    camera.mouseY = pInst.mouseY+camera.position.y-pInst.height/2;
  
    if(!camera.active)
    {
      camera.active = true;
      pInst.push();
      pInst.scale(camera.zoom);
      pInst.translate(-camera.position.x+pInst.width/2/camera.zoom, -camera.position.y+pInst.height/2/camera.zoom);
    }
  }
  
  //chamado pós desenho por padrão
  function cameraPop() {
    var pInst = this;
  
    if(pInst.camera.active)
    {
      pInst.pop();
      pInst.camera.active = false;
    }
  }
  
  
  
  
  /**
     * Em p5.play, groupos são coleções de sprites com comportamento semelhante.
     * Por exemplo, um grupo pode conter todos os sprites no plano de fundo
     * ou todos os sprites que "matam" o jogador.
     *
     * Os grupos são matrizes "estendidas" e herdam todas as suas propriedades
     * por exemplo: group.length
     *
     * Uma vez que os grupos contêm apenas referências, um sprite pode estar em vários
     * grupos e deletar um grupo não afeta os próprios sprites.
     *
     * Sprite.remove() também removerá o sprite de todos os grupos
     * que ele pertence.
     *
     * @class Group
     * @constructor
     */
  function Group() {
  
    //basicamente estendendo a matriz
    var array = [];
  
    /**
    * Obtém o membro no índice i.
    *
    * @method get
    * @param {Number} i O índice do objeto a ser recuperado
    */
    array.get = function(i) {
      return array[i];
    };
  
    /**
    * Checks if the group contains a sprite.
    *
    * @method contains
    * @param {Sprite} sprite O sprite a ser procurado
    * @return {Number} Índice ou -1 se não for encontrado
    */
    array.contains = function(sprite) {
      return this.indexOf(sprite)>-1;
    };
  
    /**
     * O mesmo que Group.contains
     * @method indexOf
     */
    array.indexOf = function(item) {
      for (var i = 0, len = array.length; i < len; ++i) {
        if (virtEquals(item, array[i])) {
          return i;
        }
      }
      return -1;
    };
  
    /**
    * Adiciona um sprite ao grupo.
    *
    * @method add
    * @param {Sprite} s O sprite a ser adicionado
    */
    array.add = function(s) {
      if(!(s instanceof Sprite)) {
        throw('Error: you can only add sprites to a group');
      }
  
      if (-1 === this.indexOf(s)) {
        array.push(s);
        s.groups.push(this);
      }
    };
  
    /**
     * O mesmo que group.length
     * @method size
     */
    array.size = function() {
      return array.length;
    };
  
    /**
    * Remove todos os sprites do grupo
    * da cena.
    *
    * @method removeSprites
    */
    array.removeSprites = function() {
      while (array.length > 0) {
        array[0].remove();
      }
    };
  
    /**
    * Remove todas as referências ao grupo.
    * Não remove os sprites de verdade.
    *
    * @method clear
    */
    array.clear = function() {
      array.length = 0;
    };
  
    /**
    * Remove um sprite do grupo.
    * Não remove o sprite de verdade, apenas a afiliação (referência).
    *
    * @method remove
    * @param {Sprite} item O sprite a ser removido
    * @return {Boolean} Verdadeiro se sprite foi encontrado e removido
    */
    array.remove = function(item) {
      if(!(item instanceof Sprite)) {
        throw('Error: you can only remove sprites from a group');
      }
  
      var i, removed = false;
      for (i = array.length - 1; i >= 0; i--) {
        if (array[i] === item) {
          array.splice(i, 1);
          removed = true;
        }
      }
  
      if (removed) {
        for (i = item.groups.length - 1; i >= 0; i--) {
          if (item.groups[i] === this) {
            item.groups.splice(i, 1);
          }
        }
      }
  
      return removed;
    };
  
    /**
     * Retorna uma cópia do grupo como uma matriz padrão.
     * @method toArray
     */
    array.toArray = function() {
      return array.slice(0);
    };
  
    /**
    * Retorna a maior profundidade em um grupo
    *
    * @method maxDepth
    * @return {Number} A profundidade do sprite desenhado na parte superior
    */
    array.maxDepth = function() {
      if (array.length === 0) {
        return 0;
      }
  
      return array.reduce(function(maxDepth, sprite) {
        return Math.max(maxDepth, sprite.depth);
      }, -Infinity);
    };
  
    /**
    * Retorna a menor profundidade em um grupo
    *
    * @method minDepth
    * @return {Number} A profundidade do sprite desenhado na parte inferior
    */
    array.minDepth = function() {
      if (array.length === 0) {
        return 99999;
      }
  
      return array.reduce(function(minDepth, sprite) {
        return Math.min(minDepth, sprite.depth);
      }, Infinity);
    };
  
    /**
    * Desenha todos os sprites do grupo.
    *
    * @method draw
    */
    array.draw = function() {
  
      //classificar por profundidade
      this.sort(function(a, b) {
        return a.depth - b.depth;
      });
  
      for(var i = 0; i<this.size(); i++)
      {
        this.get(i).display();
      }
    };
  
    //uso interno
    function virtEquals(obj, other) {
      if (obj === null || other === null) {
        return (obj === null) && (other === null);
      }
      if (typeof (obj) === 'string') {
        return obj === other;
      }
      if (typeof(obj) !== 'object') {
        return obj === other;
      }
      if (obj.equals instanceof Function) {
        return obj.equals(other);
      }
      return obj === other;
    }
  
    /**
     * Colide cada membro do grupo contra o alvo usando a colisão dada
     * modelo. Retorne verdadeiro se ocorrer alguma colisão.
     * uso interno
     *
     * @private
     * @method _groupCollide
     * @param {!string} type um de 'overlap', 'collide', 'displace', 'bounce' ou 'bounceOff'
     * @param {Object} target Grupo ou Sprite
     * @param {Function} [callback] em colisão.
     * @return {boolean} Verdadeiro se qualquer colisão/sobreposição ocorrer
     */
    function _groupCollide(type, target, callback) {
      var didCollide = false;
      for(var i = 0; i<this.size(); i++)
        didCollide = this.get(i)._collideWith(type, target, callback) || didCollide;
      return didCollide;
    }
  
    /**
    * Verifica se o grupo está se sobrepondo a outro sprite ou grupo.
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * Se o alvo for um grupo, a função será chamada para cada
    * sobreposição de sprites. O parâmetro da função são respectivamente os
    * sprite atual e o sprite em colisão.
    *
    * @example
    *     group.overlap(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method overlap
    * @param {Object} target Grupo ou Sprite para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobrepondo
    */
    array.overlap = _groupCollide.bind(array, 'overlap');
  
    /**
     * Alias para <a href='#method-overlap'>overlap()</a>
     *
     * Retorna se este grupo irá ou não saltar ou colidir com outro sprite
     * ou grupo. Modifica o objeto de propriedade de toque de cada sprite.
     *
     * @method isTouching
     * @param {Object} target Grupo ou Sprite para comparar com o atual
     * @return {Boolean} True se tocando
     */
    array.isTouching = array.overlap;
  
    /**
    * Verifica se o grupo está se sobrepondo a outro sprite ou grupo.
    * Se a sobreposição for positiva, o sprite irá pular com o(s) alvo(s)
    * tratado como imóvel com coeficiente de restituição zero.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * A função será chamada para cada sobreposição de sprites.
    * A função a ser chamada se a sobreposição for positiva. Os parâmetros da função são respectivamente o
    * membro do grupo atual e outro sprite passado como parâmetro.
    *
    * @example
    *     group.collide(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method collide
    * @param {Object} target Grupo ou Sprite para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobrepondo
    */
    array.collide = _groupCollide.bind(array, 'collide');
  
    /**
    * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
    * Se a sobreposição for positiva, os sprites do grupo irão se deslocar
    * os que estiverem colidindo, para as posições não sobrepostas mais próximas.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * A função será chamada para cada sobreposição de sprites.
    * Os parâmetros da função são respectivamente o
    * membro do grupo atual e outro sprite passado como parâmetro.
    *
    * @example
    *     group.displace(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method displace
    * @param {Object} target Grupo ou Sprite para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobrepondo
    */
    array.displace = _groupCollide.bind(array, 'displace');
  
    /**
    * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
    * Se a sobreposição for positiva, os sprites irão pular afetando cada
    * outras trajetórias dependendo de seu .velocity, .mass e .restitution.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * A função será chamada para cada sobreposição de sprites.
    * Os parâmetros da função são respectivamente o
    * membro do grupo atual e outro sprite passado como parâmetro.
    *
    * @example
    *     group.bounce(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method bounce
    * @param {Object} target Grupo ou Sprite para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobrepondo
    */
    array.bounce = _groupCollide.bind(array, 'bounce');
  
    /**
    * Verifica se o grupo está se sobrepondo a outro grupo ou sprite.
    * Se a sobreposição for positiva, os sprites irão pular com o(s) alvo(s)
    * tratados como imoveis.
    *
    * A verificação é realizada usando os colisores. Se os colisores não estiverem definidos
    * eles serão criados automaticamente a partir da caixa delimitadora de imagem/animação.
    *
    * Uma função de retorno de chamada pode ser especificada para realizar operações adicionais
    * quando ocorre a sobreposição.
    * A função será chamada para cada sobreposição de sprites.
    * Os parâmetros da função são respectivamente os
    * membro do grupo atual e outro sprite passado como parâmetro.
    *
    * @example
    *     group.bounceOff(otherSprite, explosion);
    *
    *     function explosion(spriteA, spriteB) {
    *       spriteA.remove();
    *       spriteB.score++;
    *     }
    *
    * @method bounceOff
    * @param {Object} target Grupo ou Sprite para comparar com o atual
    * @param {Function} [callback] A função a ser chamada se a sobreposição for positiva
    * @return {Boolean} True se sobrepondo
    */
    array.bounceOff = _groupCollide.bind(array, 'bounceOff');
  
    array.setPropertyEach = function(propName, value) {
      for (var i = 0; i < this.length; i++) {
        this[i][propName] = value;
      }
    };
  
    array.callMethodEach = function(methodName) {
      // Copie todos os argumentos após o primeiro parâmetro em methodArgs:
      var methodArgs = Array.prototype.slice.call(arguments, 1);
      // Use uma cópia da matriz, caso o método modifique o grupo
      var elements = [].concat(this);
      for (var i = 0; i < elements.length; i++) {
        elements[i][methodName].apply(elements[i], methodArgs);
      }
    };
  
    array.setDepthEach = array.setPropertyEach.bind(array, 'depth');
    array.setLifetimeEach = array.setPropertyEach.bind(array, 'lifetime');
    array.setRotateToDirectionEach = array.setPropertyEach.bind(array, 'rotateToDirection');
    array.setRotationEach = array.setPropertyEach.bind(array, 'rotation');
    array.setRotationSpeedEach = array.setPropertyEach.bind(array, 'rotationSpeed');
    array.setScaleEach = array.setPropertyEach.bind(array, 'scale');
    array.setColorEach = array.setPropertyEach.bind(array, 'shapeColor');
    array.setTintEach = array.setPropertyEach.bind(array, 'tint');
    array.setVisibleEach = array.setPropertyEach.bind(array, 'visible');
    array.setVelocityXEach = array.setPropertyEach.bind(array, 'velocityX');
    array.setVelocityYEach = array.setPropertyEach.bind(array, 'velocityY');
    array.setHeightEach = array.setPropertyEach.bind(array, 'height');
    array.setWidthEach = array.setPropertyEach.bind(array, 'width');
  
    array.destroyEach = array.callMethodEach.bind(array, 'destroy');
    array.pointToEach = array.callMethodEach.bind(array, 'pointTo');
    array.setAnimationEach = array.callMethodEach.bind(array, 'setAnimation');
    array.setColliderEach = array.callMethodEach.bind(array, 'setCollider');
    array.setSpeedAndDirectionEach = array.callMethodEach.bind(array, 'setSpeedAndDirection');
    array.setVelocityEach = array.callMethodEach.bind(array, 'setVelocity');
    array.setMirrorXEach = array.callMethodEach.bind(array, 'mirrorX');
    array.setMirrorYEach = array.callMethodEach.bind(array, 'mirrorY');
  
    return array;
  }
  
  p5.prototype.Group = Group;
  
  /**
   * Cria quatro sprites de borda e os adiciona a um grupo. Cada borda está do lado de fora
   * da tela e tem uma espessura de 100. Depois de chamar esta função,
   * as seguintes propriedades são expostas e preenchidas com sprites:
   * leftEdge, rightEdge, topEdge, bottomEdge
   *
   * A propriedade 'bordas' é preenchida com um grupo contendo esses quatro sprites.
   *
   * Se este sprite de borda já tiver sido criado, a função retorna o
   * grupo de bordas existente imediatamente.
   *
   * @method createEdgeSprites
   * @return {Group} O grupo de bordas
   */
  p5.prototype.createEdgeSprites = function() {
    if (this.edges) {
      return this.edges;
    }
  
    var edgeThickness = 100;
  
    var width = this._curElement.elt.offsetWidth;
    var height = this._curElement.elt.offsetHeight;

  
    this.leftEdge = this.createSprite(-edgeThickness / 2, height / 2, edgeThickness, height);
    this.rightEdge = this.createSprite(width + (edgeThickness / 2), height / 2, edgeThickness, height);
    this.topEdge = this.createSprite(width / 2, -edgeThickness / 2, width, edgeThickness);
    this.bottomEdge = this.createSprite(width / 2, height + (edgeThickness / 2), width, edgeThickness);
  
    this.edges = this.createGroup();
    this.edges.add(this.leftEdge);
    this.edges.add(this.rightEdge);
    this.edges.add(this.topEdge);
    this.edges.add(this.bottomEdge);
  
    return this.edges;
  };
  
  /**
   * Um objeto de animação contém uma série de imagens (p5.Image) que
   * pode ser exibido sequencialmente.
   *
   * Todos os arquivos devem ser imagens PNG. Você deve incluir o diretório da raiz do esboço,
   * e a extensão .png
   *
   * Um sprite pode ter várias animações rotuladas, consulte Sprite.addAnimation
   * e Sprite.changeAnimation, no entanto, uma animação pode ser usada independentemente.
   *
   * Uma animação pode ser criada passando uma série de nomes de arquivo,
   * não importa quantos ou passando o primeiro e o último nome de arquivo
   * de uma sequência numerada.
   * p5.play tentará detectar o padrão de sequência.
   *
   * Por exemplo, se os nomes dos arquivos dados são
   * "data/file0001.png" e "data/file0005.png" as imagens
   * "data/file0003.png" e "data/file0004.png" também serão carregadas.
   *
   * @example
   *     var sequenceAnimation;
   *     var glitch;
   *
   *     function preload() {
   *       sequenceAnimation = loadAnimation("data/walking0001.png", "data/walking0005.png");
   *       glitch = loadAnimation("data/dog.png", "data/horse.png", "data/cat.png", "data/snake.png");
   *     }
   *
   *     function setup() {
   *       createCanvas(800, 600);
   *     }
   *
   *     function draw() {
   *       background(0);
   *       animation(sequenceAnimation, 100, 100);
   *       animation(glitch, 200, 100);
   *     }
   *
   * @class Animation
   * @constructor
   * @param {String} fileName1 Primeiro arquivo em uma sequência OU primeiro arquivo de imagem
   * @param {String} fileName2 Último arquivo em uma sequência OU segundo arquivo de imagem
   * @param {String} [...fileNameN] Qualquer número de arquivos de imagem após os dois primeiros
   */
  function Animation(pInst) {
    var frameArguments = Array.prototype.slice.call(arguments, 1);
    var i;
  
    var CENTER = p5.prototype.CENTER;
  
    /**
    * Matriz de quadros (p5.Image)
    *
    * @property images
    * @type {Array}
    */
    this.images = [];
  
    var frame = 0;
    var cycles = 0;
    var targetFrame = -1;
  
    this.offX = 0;
    this.offY = 0;
  
    /**
    * Atraso entre os quadros em número de ciclos de desenho.
    * Se definido como 4, a taxa de quadros da animação seria
    * o esboço do sketch divido por 4 (60fps = 15fps)
    *
    * @property frameDelay
    * @type {Number}
    * @default 2
    */
    this.frameDelay = 4;
  
    /**
    * True se a animação estiver sendo reproduzida.
    *
    * @property playing
    * @type {Boolean}
    * @default true
    */
    this.playing = true;
  
    /**
    * Visibilidade da animação.
    *
    * @property visible
    * @type {Boolean}
    * @default true
    */
    this.visible = true;
  
    /**
    * Se for definido como falso, a animação irá parar após atingir o último quadro
    *
    * @property looping
    * @type {Boolean}
    * @default true
    */
    this.looping = true;
  
    /**
    * True se o quadro mudou durante o último ciclo de desenho
    *
    * @property frameChanged
    * @type {Boolean}
    */
    this.frameChanged = false;
  
    // é o colisor definido manualmente ou definido
   // pelo tamanho do quadro atual
    this.imageCollider = false;
  
  
    //modo de sequência
    if(frameArguments.length === 2 && typeof frameArguments[0] === 'string' && typeof frameArguments[1] === 'string')
    {
      var from = frameArguments[0];
      var to = frameArguments[1];
  
      //print("sequence mode "+from+" -> "+to);
  
      //certifique-se de que as extensões estão corretas
      var ext1 = from.substring(from.length-4, from.length);
      if(ext1 !== '.png')
      {
        pInst.print('Animation error: you need to use .png files (filename '+from+')');
        from = -1;
      }
  
      var ext2 = to.substring(to.length-4, to.length);
      if(ext2 !== '.png')
      {
        pInst.print('Animation error: you need to use .png files (filename '+to+')');
        to = -1;
      }
  
      //extensões estão bem
      if(from !== -1 && to !== -1)
      {
        var digits1 = 0;
        var digits2 = 0;
  
        //pule extensão e trabalhe voltando para frente para encontrar os números
        for (i = from.length-5; i >= 0; i--) {
          if(from.charAt(i) >= '0' && from.charAt(i) <= '9')
            digits1++;
        }
  
        for (i = to.length-5; i >= 0; i--) {
          if(to.charAt(i) >= '0' && to.charAt(i) <= '9')
            digits2++;
        }
  
        var prefix1 = from.substring(0, from.length-(4+digits1));
        var prefix2 = to.substring(0, to.length-(4+digits2) );
  
        // Nossos números provavelmente têm zeros à esquerda, o que significa que alguns
        // navegadores (por exemplo, PhantomJS) irão interpretá-los como base 8 (octal),
        // em vez de decimal. Para corrigir isso, diremos explicitamente ao parseInt para
        // usar uma base 10 (decimal). Para obter mais detalhes sobre este problema, consulte
        // http://stackoverflow.com/a/8763427/2422398.
        var number1 = parseInt(from.substring(from.length-(4+digits1), from.length-4), 10);
        var number2 = parseInt(to.substring(to.length-(4+digits2), to.length-4), 10);
  
        //trocar se invertido
        if(number2<number1)
        {
          var t = number2;
          number2 = number1;
          number1 = t;
        }
  
        //dois quadros diferentes
        if(prefix1 !== prefix2 )
        {
          //print("2 separate images");
          this.images.push(pInst.loadImage(from));
          this.images.push(pInst.loadImage(to));
        }
        //mesmos dígitos: caso img0001, img0002
        else
        {
          var fileName;
          if(digits1 === digits2)
          {
  
            //carregar todas as imagens
            for (i = number1; i <= number2; i++) {
              // Use nf() para numerar o formato 'i' em quatro dígitos
              fileName = prefix1 + pInst.nf(i, digits1) + '.png';
              this.images.push(pInst.loadImage(fileName));
  
            }
  
          }
          else //case: case img1, img2
          {
            //print("from "+prefix1+" "+number1 +" to "+number2);
            for (i = number1; i <= number2; i++) {
              // Use nf() para numerar o formato 'i' em quatro dígitos
              fileName = prefix1 + i + '.png';
              this.images.push(pInst.loadImage(fileName));
  
            }
  
          }
        }
  
      }//fim de sem erro externo
  
    }//fim do modo de sequência
    // Modo de planilha Sprite
    else if (frameArguments.length === 1 && (frameArguments[0] instanceof SpriteSheet))
    {
      this.spriteSheet = frameArguments[0];
      this.images = this.spriteSheet.frames.map( function(f) {
        if (f.spriteSourceSize && f.sourceSize) {
          return Object.assign(f.frame, {
            width: f.frame.w,
            height: f.frame.h,
            sourceX: f.spriteSourceSize.x,
            sourceY: f.spriteSourceSize.y,
            sourceW: f.sourceSize.w,
            sourceH: f.sourceSize.h,
          });
        }
        return f.frame;
      });
    }
    else if(frameArguments.length !== 0)//lista arbitrária de imagens
    {
      //print("Animation arbitrary mode");
      for (i = 0; i < frameArguments.length; i++) {
        //print("loading "+fileNames[i]);
        if(frameArguments[i] instanceof p5.Image)
          this.images.push(frameArguments[i]);
        else
          this.images.push(pInst.loadImage(frameArguments[i]));
      }
    }
  
    /**
    * Objetos são passados por referência para ter sprites diferentes
    * usando a mesma animação que você precisa para cloná-lo.
    *
    * @method clone
    * @return {Animation} Um clone da animação atual
    */
    this.clone = function() {
      var myClone = new Animation(pInst); //vazio
      myClone.images = [];
  
      if (this.spriteSheet) {
        myClone.spriteSheet = this.spriteSheet.clone();
      }
      myClone.images = this.images.slice();
  
      myClone.offX = this.offX;
      myClone.offY = this.offY;
      myClone.frameDelay = this.frameDelay;
      myClone.playing = this.playing;
      myClone.looping = this.looping;
  
      return myClone;
    };
  
    /**
     * Desenha a animação nas coordenadas x e y.
     * Atualiza os quadros automaticamente.
     *
     * @method draw
     * @param {Number} x coordenada x
     * @param {Number} y coordenada y
     * @param {Number} [r=0] rotação
     */
    this.draw = function(x, y, r) {
      this.xpos = x;
      this.ypos = y;
      this.rotation = r || 0;
  
      if (this.visible)
      {
  
        //apenas conexão com a classe sprite
        //se a animação for usada de forma independente, desenhar e atualizar são o mesmo
        if(!this.isSpriteAnimation)
          this.update();
  
        //this.currentImageMode = g.imageMode;
        pInst.push();
        pInst.imageMode(CENTER);
  
        var xTranslate = this.xpos;
        var yTranslate = this.ypos;
        var image = this.images[frame];
        var frame_info = this.spriteSheet && image;
  
        // Ajuste a tradução se estivermos lidando com uma planilha de sprites compactada com textura
        // (com adereços sourceW, sourceH, sourceX, sourceY na nossa matriz de imagens)
        if (frame_info) {
          var missingX = (frame_info.sourceW || frame_info.width) - frame_info.width;
          var missingY = (frame_info.sourceH || frame_info.height) - frame_info.height;
          // Se a contagem de pixels ausentes (transparentes) não for igualmente equilibrada em
          // esquerda x direita ou superior x inferior, ajustamos a tradução:
          xTranslate += ((frame_info.sourceX || 0) - missingX / 2);
          yTranslate += ((frame_info.sourceY || 0) - missingY / 2);
        }
  
        pInst.translate(xTranslate, yTranslate);
        if (pInst._angleMode === pInst.RADIANS) {
          pInst.rotate(radians(this.rotation));
        } else {
          pInst.rotate(this.rotation);
        }
  
        if (frame_info) {
          if (this.spriteSheet.image instanceof Image) {
            pInst.imageElement(this.spriteSheet.image,
              frame_info.x, frame_info.y,
              frame_info.width, frame_info.height,
              this.offX, this.offY,
              frame_info.width, frame_info.height);
          } else {
            pInst.image(this.spriteSheet.image,
              frame_info.x, frame_info.y,
              frame_info.width, frame_info.height,
              this.offX, this.offY,
              frame_info.width, frame_info.height);
            }
        } else if (image) {
          if (image instanceof Image) {
            pInst.imageElement(image, this.offX, this.offY);
          } else {
            pInst.image(image, this.offX, this.offY);
          }
        } else {
          pInst.print('Warning undefined frame '+frame);
          //this.isActive = false;
        }
  
        pInst.pop();
      }
    };
  
    //chamado por desenho
    this.update = function() {
      cycles++;
      var previousFrame = frame;
      this.frameChanged = false;
  
  
      //vá para o quadro
      if(this.images.length === 1)
      {
        this.playing = false;
        frame = 0;
      }
  
      if ( this.playing && cycles%this.frameDelay === 0)
      {
        //indo para o quadro alto do alvo
        if(targetFrame>frame && targetFrame !== -1)
        {
          frame++;
        }
        //indo para o quadro baixo do alvo
        else if(targetFrame<frame && targetFrame !== -1)
        {
          frame--;
        }
        else if(targetFrame === frame && targetFrame !== -1)
        {
          this.playing=false;
        }
        else if (this.looping) //quadro avançado
        {
          //se o próximo quadro for muito alto
          if (frame>=this.images.length-1)
            frame = 0;
          else
            frame++;
        } else
        {
          //se o próximo quadro for muito alto
          if (frame<this.images.length-1)
            frame++;
          else
            this.playing = false;
        }
      }
  
      if(previousFrame !== frame)
        this.frameChanged = true;
  
    };//fim da atualização
  
    /**
    * Reproduz a animação.
    *
    * @method play
    */
    this.play = function() {
      this.playing = true;
      targetFrame = -1;
    };
  
    /**
    * Para a animação
    *
    * @method stop
    */
    this.stop = function(){
      this.playing = false;
    };
  
    /**
    * Retrocede a animação para o primeiro quadro.
    *
    * @method rewind
    */
    this.rewind = function() {
      frame = 0;
    };
  
    /**
    * Altera o quadro atual.
    *
    * @method changeFrame
    * @param {Number} frame Número do quadro (começa em 0).
    */
    this.changeFrame = function(f) {
      if (f<this.images.length)
        frame = f;
      else
        frame = this.images.length - 1;
  
      targetFrame = -1;
      //this.playing = false;
    };
  
    /**
     * Vai para o próximo quadro e para.
     *
     * @method nextFrame
     */
    this.nextFrame = function() {
  
      if (frame<this.images.length-1)
        frame = frame+1;
      else if(this.looping)
        frame = 0;
  
      targetFrame = -1;
      this.playing = false;
    };
  
    /**
     * Vai para o quadro anterior e para.
     *
     * @method previousFrame
     */
    this.previousFrame = function() {
  
      if (frame>0)
        frame = frame-1;
      else if(this.looping)
        frame = this.images.length-1;
  
      targetFrame = -1;
      this.playing = false;
    };
  
    /**
    * Reproduz a animação para frente ou para trás em direção a um quadro de destino.
    *
    * @method goToFrame
    * @param {Number} toFrame Destino do número do quadro (começa em 0)
    */
    this.goToFrame = function(toFrame) {
      if(toFrame < 0 || toFrame >= this.images.length) {
        return;
      }
  
      // targetFrame é usado pelo método update() para decidir qual próximo
      // quadro selecionar.  Quando não está sendo usado, é definido como -1.
      targetFrame = toFrame;
  
      if(targetFrame !== frame) {
        this.playing = true;
      }
    };
  
    /**
    * Retorna o número do quadro atual.
    *
    * @method getFrame
    * @return {Number} Quadro atual (começa em 0)
    */
    this.getFrame = function() {
      return frame;
    };
  
    /**
    * Retorna o último número do quadro.
    *
    * @method getLastFrame
    * @return {Number} Último número do quadro (começa em 0)
    */
    this.getLastFrame = function() {
      return this.images.length-1;
    };
  
    /**
    * Retorna a imagem do quadro atual como p5.Image.
    *
    * @method getFrameImage
    * @return {p5.Image} Imagem do quadro atual
    */
    this.getFrameImage = function() {
      return this.images[frame];
    };
  
    /**
    * Retorna a imagem do quadro no número do quadro especificado.
    *
    * @method getImageAt
    * @param {Number} frame Número do quadro
    * @return {p5.Image} Imagem do quadro
    */
    this.getImageAt = function(f) {
      return this.images[f];
    };
  
    /**
    * Retorna a largura do quadro atual em pixels.
    * Se não houver imagem carregada, retorna 1.
    *
    * @method getWidth
    * @return {Number} Largura do quadro
    */
    this.getWidth = function() {
      if (this.images[frame]) {
        return this.images[frame].sourceW || this.images[frame].width;
      } else {
        return 1;
      }
    };
  
    /**
    * Retorna a altura do quadro atual em pixels.
    * Se não houver imagem carregada, retorna 1.
    *
    * @method getHeight
    * @return {Number} Altura do quadro
    */
    this.getHeight = function() {
      if (this.images[frame]) {
        return this.images[frame].sourceH || this.images[frame].height;
      } else {
        return 1;
      }
    };
  
  }
  
  defineLazyP5Property('Animation', boundConstructorFactory(Animation));
  
  /**
   * Representa uma planilha de sprite e todos os seus quadros. Para ser usado com animação,
   * ou quadros únicos de desenho estático.
   *
   *  Existem duas maneiras diferentes de carregar uma SpriteSheet
   *
   * 1. Dada a largura, altura que será usada para cada quadro e o
   *    número de quadros para percorrer. A planilha de sprite deve ter uma
   *    grade uniforme com linhas e colunas consistentes.
   *
   * 2. Dada uma série de objetos de quadro que definem a posição e
   *    dimensões de cada quadro. Isso é flexível porque você pode usar
   *    planilhas de sprite que não possuem linhas e colunas uniformes.
   *
   * @example
   *     // Método 1 - Usando largura, altura para cada quadro e número de quadros
   *     explode_sprite_sheet = loadSpriteSheet('assets/explode_sprite_sheet.png', 171, 158, 11);
   *
   *     // Método 2 - Usando uma série de objetos que definem cada quadro
   *     var player_frames = loadJSON('assets/tiles.json');
   *     player_sprite_sheet = loadSpriteSheet('assets/player_spritesheet.png', player_frames);
   *
   * @class SpriteSheet
   * @constructor
   * @param image String caminho da imagem ou objeto p5.Image
   */
  function SpriteSheet(pInst) {
    var spriteSheetArgs = Array.prototype.slice.call(arguments, 1);
  
    this.image = null;
    this.frames = [];
    this.frame_width = 0;
    this.frame_height = 0;
    this.num_frames = 0;
  
    /**
     * Gere os dados dos frames para esta folha de sprite com base nos parâmetros do usuário
     * @private
     * @method _generateSheetFrames
     */
    this._generateSheetFrames = function() {
      var sX = 0, sY = 0;
      for (var i = 0; i < this.num_frames; i++) {
        this.frames.push(
          {
            'name': i,
            'frame': {
              'x': sX,
              'y': sY,
              'width': this.frame_width,
              'height': this.frame_height
            }
          });
        sX += this.frame_width;
        if (sX >= this.image.width) {
          sX = 0;
          sY += this.frame_height;
          if (sY >= this.image.height) {
            sY = 0;
          }
        }
      }
    };
  
    var shortArgs = spriteSheetArgs.length === 2 || spriteSheetArgs.length === 3;
    var longArgs = spriteSheetArgs.length === 4 || spriteSheetArgs.length === 5;
  
    if (shortArgs && Array.isArray(spriteSheetArgs[1])) {
      this.frames = spriteSheetArgs[1];
      this.num_frames = this.frames.length;
    } else if (longArgs &&
      (typeof spriteSheetArgs[1] === 'number') &&
      (typeof spriteSheetArgs[2] === 'number') &&
      (typeof spriteSheetArgs[3] === 'number')) {
      this.frame_width = spriteSheetArgs[1];
      this.frame_height = spriteSheetArgs[2];
      this.num_frames = spriteSheetArgs[3];
    }
  
    if(spriteSheetArgs[0] instanceof p5.Image || spriteSheetArgs[0] instanceof Image) {
      this.image = spriteSheetArgs[0];
      if (longArgs) {
        this._generateSheetFrames();
      }
    } else {
      // Quando o argumento final está presente (seja o 3º ou 5º), ele indica
      // se devemos carregar o URL como um elemento de imagem (em oposição ao padrão
      // de comportamento, que é carregá-lo como um p5.Image). Se esse argumento for uma função,
      // ele será chamado de volta assim que o carregamento for bem-sucedido ou falhar. No sucesso, a imagem
      // será fornecida como o único parâmetro. Em caso de falha, nulo será fornecido.
      var callback;
      if (shortArgs) {
        if (spriteSheetArgs[2]) {
          if (typeof spriteSheetArgs[2] === 'function') {
            callback = spriteSheetArgs[2];
          }
          this.image = pInst.loadImageElement(
            spriteSheetArgs[0],
            function(img) { if (callback) return callback(img); },
            function() { if (callback) return callback(null); }
          );
        } else {
          this.image = pInst.loadImage(spriteSheetArgs[0]);
        }
      } else if (longArgs) {
        var generateSheetFrames = this._generateSheetFrames.bind(this);
        if (spriteSheetArgs[4]) {
          if (typeof spriteSheetArgs[4] === 'function') {
            callback = spriteSheetArgs[4];
          }
          this.image = pInst.loadImageElement(
            spriteSheetArgs[0],
            function(img) {
              generateSheetFrames(img);
              if (callback) return callback(img);
            },
            function() { if (callback) return callback(null); }
          );
        } else {
          this.image = pInst.loadImage(spriteSheetArgs[0], generateSheetFrames);
        }
      }
    }
  
    /**
     * Desenha um quadro específico para a tela.
     * @param frame_name  Pode ser um nome de string ou um índice numérico.
     * @param x   posição x para onde desenhar o quadro
     * @param y   posição y para onde desenhar o quadro
     * @param [width]   largura opcional para desenhar a moldura
     * @param [height]  altura opcional para desenhar a moldura
     * @method drawFrame
     */
    this.drawFrame = function(frame_name, x, y, width, height) {
      var frameToDraw;
      if (typeof frame_name === 'number') {
        frameToDraw = this.frames[frame_name];
      } else {
        for (var i = 0; i < this.frames.length; i++) {
          if (this.frames[i].name === frame_name) {
            frameToDraw = this.frames[i];
            break;
          }
        }
      }
      var frameWidth = frameToDraw.frame.width || frameToDraw.frame.w;
      var frameHeight = frameToDraw.frame.height || frameToDraw.frame.h;
      var dWidth = width || frameWidth;
      var dHeight = height || frameHeight;
  
      // Ajuste a forma como desenhamos se estivermos lidando com uma planilha de sprites compactada com textura
      // (em particular, tratamos os parâmetros de largura e altura fornecidos como uma intenção
      // para dimensionar em relação ao sourceSize [antes da embalagem])
      if (frameToDraw.spriteSourceSize && frameToDraw.sourceSize) {
        var frameSizeScaleX = frameWidth / frameToDraw.sourceSize.w;
        var frameSizeScaleY = frameHeight / frameToDraw.sourceSize.h;
        if (width) {
          x += (frameToDraw.spriteSourceSize.x * dWidth / frameToDraw.sourceSize.w);
          dWidth = width * frameSizeScaleX;
        } else {
          x += frameToDraw.spriteSourceSize.x;
        }
        if (height) {
          y += (frameToDraw.spriteSourceSize.y * dHeight / frameToDraw.sourceSize.h);
          dHeight = height * frameSizeScaleY;
        } else {
          y += frameToDraw.spriteSourceSize.y;
        }
      }
      if (this.image instanceof Image) {
        pInst.imageElement(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
          frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
      } else {
        pInst.image(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
          frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
      }
    };
  
    /**
     * Objetos são passados por referência para ter sprites diferentes
     * usando a mesma animação que você precisa para cloná-lo.
     *
     * @method clone
     * @return {SpriteSheet} Um clone do atual SpriteSheet
     */
    this.clone = function() {
      var myClone = new SpriteSheet(pInst); //vazio
  
      // Clone profundamente os quadros por valor, não por referência
      for(var i = 0; i < this.frames.length; i++) {
        var frame = this.frames[i].frame;
        var cloneFrame = {
          'name':frame.name,
          'frame': {
            'x':frame.x,
            'y':frame.y,
            'width':frame.width,
            'height':frame.height
          }
        };
        myClone.frames.push(cloneFrame);
      }
  
      // clonar outros campos
      myClone.image = this.image;
      myClone.frame_width = this.frame_width;
      myClone.frame_height = this.frame_height;
      myClone.num_frames = this.num_frames;
  
      return myClone;
    };
  }
  
  defineLazyP5Property('SpriteSheet', boundConstructorFactory(SpriteSheet));
  
  //construtor geral para poder alimentar argumentos como matrizes
  function construct(constructor, args) {
    function F() {
      return constructor.apply(this, args);
    }
    F.prototype = constructor.prototype;
    return new F();
  }
  
  
  
  
  
  /*
   * Javascript Quadtree
   * baseado em
   * https://github.com/timohausmann/quadtree-js/
   * Copyright © 2012 Timo Hausmann
  */
  
  function Quadtree( bounds, max_objects, max_levels, level ) {
  
    this.active = true;
    this.max_objects	= max_objects || 10;
    this.max_levels		= max_levels || 4;
  
    this.level 			= level || 0;
    this.bounds 		= bounds;
  
    this.objects 		= [];
    this.object_refs	= [];
    this.nodes 			= [];
  }
  
  Quadtree.prototype.updateBounds = function() {
  
    //encontrar área máxima
    var objects = this.getAll();
    var x = 10000;
    var y = 10000;
    var w = -10000;
    var h = -10000;
  
    for( var i=0; i < objects.length; i++ )
      {
        if(objects[i].position.x < x)
          x = objects[i].position.x;
        if(objects[i].position.y < y)
          y = objects[i].position.y;
        if(objects[i].position.x > w)
          w = objects[i].position.x;
        if(objects[i].position.y > h)
          h = objects[i].position.y;
      }
  
  
    this.bounds = {
      x:x,
      y:y,
      width:w,
      height:h
    };
    //print(this.bounds);
  };
  
  /*
     * Divida o nó em 4 subnós
     */
  Quadtree.prototype.split = function() {
  
    var nextLevel	= this.level + 1,
        subWidth	= Math.round( this.bounds.width / 2 ),
        subHeight 	= Math.round( this.bounds.height / 2 ),
        x 			= Math.round( this.bounds.x ),
        y 			= Math.round( this.bounds.y );
  
    //nó superior direito
    this.nodes[0] = new Quadtree({
      x	: x + subWidth,
      y	: y,
      width	: subWidth,
      height	: subHeight
    }, this.max_objects, this.max_levels, nextLevel);
  
    //nó superior esquerdo
    this.nodes[1] = new Quadtree({
      x	: x,
      y	: y,
      width	: subWidth,
      height	: subHeight
    }, this.max_objects, this.max_levels, nextLevel);
  
    //nó inferior esquerdo
    this.nodes[2] = new Quadtree({
      x	: x,
      y	: y + subHeight,
      width	: subWidth,
      height	: subHeight
    }, this.max_objects, this.max_levels, nextLevel);
  
    //nó inferior direito
    this.nodes[3] = new Quadtree({
      x	: x + subWidth,
      y	: y + subHeight,
      width	: subWidth,
      height	: subHeight
    }, this.max_objects, this.max_levels, nextLevel);
  };
  
  
  /*
     * Determine o quadrante para uma área neste nó
     */
  Quadtree.prototype.getIndex = function( pRect ) {
    if(!pRect.collider)
      return -1;
    else
    {
      var colliderBounds = pRect.collider.getBoundingBox();
      var index 				= -1,
          verticalMidpoint 	= this.bounds.x + (this.bounds.width / 2),
          horizontalMidpoint 	= this.bounds.y + (this.bounds.height / 2),
  
          //pRect pode caber completamente nos quadrantes superiores
          topQuadrant = (colliderBounds.top < horizontalMidpoint && colliderBounds.bottom < horizontalMidpoint),
  
          //pRect pode caber completamente nos quadrantes inferiores
          bottomQuadrant = (colliderBounds.top > horizontalMidpoint);
  
      //pRect pode caber completamente nos quadrantes esquerdos
      if (colliderBounds.left < verticalMidpoint && colliderBounds.right < verticalMidpoint ) {
        if( topQuadrant ) {
          index = 1;
        } else if( bottomQuadrant ) {
          index = 2;
        }
  
        //pRect pode caber completamente nos quadrantes direitos
      } else if( colliderBounds.left > verticalMidpoint ) {
        if( topQuadrant ) {
          index = 0;
        } else if( bottomQuadrant ) {
          index = 3;
        }
      }
  
      return index;
    }
  };
  
  
  /*
     * Insira um objeto no nó. Se o nó
     * excede a capacidade, ele irá dividir e adicionar todos
     * objetos para seus subnós correspondentes.
     */
  Quadtree.prototype.insert = function( obj ) {
    //evite inserção dupla
    if(this.objects.indexOf(obj) === -1)
    {
  
      var i = 0,
          index;
  
      //se tivermos subnós...
      if( typeof this.nodes[0] !== 'undefined' ) {
        index = this.getIndex( obj );
  
        if( index !== -1 ) {
          this.nodes[index].insert( obj );
          return;
        }
      }
  
      this.objects.push( obj );
  
      if( this.objects.length > this.max_objects && this.level < this.max_levels ) {
  
        //dividir se ainda não tivermos subnós
        if( typeof this.nodes[0] === 'undefined' ) {
          this.split();
        }
  
        //adicione todos os objetos aos seus subnós correspondentes
        while( i < this.objects.length ) {
  
          index = this.getIndex( this.objects[i] );
  
          if( index !== -1 ) {
            this.nodes[index].insert( this.objects.splice(i, 1)[0] );
          } else {
            i = i + 1;
          }
        }
      }
    }
  };
  
  
  /*
     * Retorne todos os objetos que podem colidir com uma determinada área
     */
  Quadtree.prototype.retrieve = function( pRect ) {
  
  
    var index = this.getIndex( pRect ),
        returnObjects = this.objects;
  
    //se tivermos subnós...
    if( typeof this.nodes[0] !== 'undefined' ) {
  
      //se pRect se encaixa em um subnó...
      if( index !== -1 ) {
        returnObjects = returnObjects.concat( this.nodes[index].retrieve( pRect ) );
  
        //se pRect não se encaixa em um subnó, compare-o com todos os subnós
      } else {
        for( var i=0; i < this.nodes.length; i=i+1 ) {
          returnObjects = returnObjects.concat( this.nodes[i].retrieve( pRect ) );
        }
      }
    }
  
    return returnObjects;
  };
  
  Quadtree.prototype.retrieveFromGroup = function( pRect, group ) {
  
    var results = [];
    var candidates = this.retrieve(pRect);
  
    for(var i=0; i<candidates.length; i++)
      if(group.contains(candidates[i]))
      results.push(candidates[i]);
  
    return results;
  };
  
  /*
     * Coloque todos os objetos armazenados no quadtree
     */
  Quadtree.prototype.getAll = function() {
  
    var objects = this.objects;
  
    for( var i=0; i < this.nodes.length; i=i+1 ) {
      objects = objects.concat( this.nodes[i].getAll() );
    }
  
    return objects;
  };
  
  
  /*
     * Obtenha o nó no qual um determinado objeto está armazenado
     */
  Quadtree.prototype.getObjectNode = function( obj ) {
  
    var index;
  
    //se não houver subnós, o objeto deve estar aqui
    if( !this.nodes.length ) {
  
      return this;
  
    } else {
  
      index = this.getIndex( obj );
  
      //se o objeto não se encaixa em um subnó, ele deve estar aqui
      if( index === -1 ) {
  
        return this;
  
        //se ele se encaixa em um subnó, continue uma pesquisa mais profunda lá
      } else {
        var node = this.nodes[index].getObjectNode( obj );
        if( node ) return node;
      }
    }
  
    return false;
  };
  
  
  /*
     * Remove um objeto específico do quadtree
     * Não exclui subnós vazios. Veja a função de limpeza
     */
  Quadtree.prototype.removeObject = function( obj ) {
  
    var node = this.getObjectNode( obj ),
        index = node.objects.indexOf( obj );
  
    if( index === -1 ) return false;
  
    node.objects.splice( index, 1);
  };
  
  
  /*
     * Limpa o quadtree e exclua todos os objetos
     */
  Quadtree.prototype.clear = function() {
  
    this.objects = [];
  
    if( !this.nodes.length ) return;
  
    for( var i=0; i < this.nodes.length; i=i+1 ) {
  
      this.nodes[i].clear();
    }
  
    this.nodes = [];
  };
  
  
  /*
     * Limpa o quadtree
     * Como apagar, mas os objetos não serão excluídos, mas reinseridos
     */
  Quadtree.prototype.cleanup = function() {
  
    var objects = this.getAll();
  
    this.clear();
  
    for( var i=0; i < objects.length; i++ ) {
      this.insert( objects[i] );
    }
  };
  
  
  
  function updateTree() {
    if(this.quadTree.active)
    {
      this.quadTree.updateBounds();
      this.quadTree.cleanup();
    }
  }
  
  //entrada de teclado
  p5.prototype.registerMethod('pre', p5.prototype.readPresses);
  
  //atualização automática de sprite
  p5.prototype.registerMethod('pre', p5.prototype.updateSprites);
  
  //atualização de quadtree
  p5.prototype.registerMethod('post', updateTree);
  
  //empurrar e estourar a câmera
  p5.prototype.registerMethod('pre', cameraPush);
  p5.prototype.registerMethod('post', cameraPop);
  
  p5.prototype.registerPreloadMethod('loadImageElement', p5.prototype);
  
  //deltaTime
  //p5.prototype.registerMethod('pre', updateDelta);
  
  /**
   * Registre uma mensagem de aviso na tela do host, usando `console.warn` nativo
   * caso esteja disponível, mas recorrer ao `console.log` se não estiver. Se a tela
   * não estiver disponível, este método falhará silenciosamente.
   * @method _warn
   * @param {!string} message
   * @private
   */
  p5.prototype._warn = function(message) {
    var console = window.console;
  
    if(console)
    {
      if('function' === typeof console.warn)
      {
        console.warn(message);
      }
      else if('function' === typeof console.log)
      {
        console.log('Warning: ' + message);
      }
    }
  };
  
    /**
     * Classe Base de Forma de Colisão
     *
     * Temos um conjunto de formas de colisão disponíveis que estão em conformidade com
     * uma interface simples para que possam ser verificados um com o outro
     * usando o Teorema do Eixo de Separação.
     *
     * Esta classe base implementa todos os métodos necessários para uma forma
     * de colisão e pode ser usado como um ponto de colisão sem alterações.
     * Outras formas devem ser herdadas disso e substituir a maioria dos métodos.
     *
     * @class p5.CollisionShape
     * @constructor
     * @param {p5.Vector} [center] (zero se omitido)
     * @param {number} [rotation] (zero se omitido)
     */
    p5.CollisionShape = function(center, rotation) {
      /**
       * Transformar esta forma em relação a sua mãe. Se não houver nenhuma mãe,
       * esta é basicamente a transformação do espaço-mundo.
       * Isso deve permanecer consistente com propriedades _offset, _rotation e _scale.
       * @property _localTransform
       * @type {p5.Transform2D}
       * @protected
       */
      this._localTransform = new p5.Transform2D();
      if (rotation) {
        this._localTransform.rotate(rotation);
      }
      if (center) {
        this._localTransform.translate(center);
      }
  
      /**
       * Transformar qualquer objeto-mãe (provavelmente um sprite), esta forma com que
       * é associada. Se esta for uma forma flutuante, a transformação-mãe
       * permanecerá uma matriz de identidade.
       * @property _parentTransform
       * @type {p5.Transform2D}
       * @protected
       */
      this._parentTransform = new p5.Transform2D();
  
      /**
       * O centro da forma de colisão no espaço-mundo.
       * @property _center
       * @private
       * @type {p5.Vector}
       */
      this._center = new p5.Vector();
  
      /**
       * O centro da forma de colisão no espaço local; também, o deslocamento do
       * centro da forma de colisão a partir do centro de seu sprite mãe.
       * @property _offset
       * @type {p5.Vector}
       * @private
       */
      this._offset = new p5.Vector();
  
      /**
       * Rotação em radianos no espaço local (em relação a mãe.
       * Observe que isso só será significativo para formas que podem girar,
       * ou seja, caixas delimitadoras orientadas
       * @property _rotation
       * @private
       * @type {number}
       */
      this._rotation = 0;
  
      /**
       * Escala X e Y no espaço local. Observe que isso só será significativo
       * para formas com dimensões (por exemplo, não para pontos de colisão)
       * @property _scale
       * @type {p5.Vector}
       * @private
       */
      this._scale = new p5.Vector(1, 1);
  
      /**
       * Se for verdadeiro, ao chamar `updateFromSprite` este colisor adotará as
       * dimensões básicas do sprite, além de adotar sua transformação.
       * Se for falso, apenas a transformação (posição/rotação/escala) será adotada.
       * @property getsDimensionsFromSprite
       * @type {boolean}
       */
      this.getsDimensionsFromSprite = false;
  
      // Procriador/normatizador público
      Object.defineProperties(this, {
  
        /**
         * O centro da forma de colisão no espaço-mundo.
         * Nota: Você pode definir esta propriedade com um valor no espaço do mundo, mas irá
         * de fato modificar a transformação local da forma de colisão.
         * @property center
         * @type {p5.Vector}
         */
        'center': {
          enumerable: true,
          get: function() {
            return this._center.copy();
          }.bind(this),
          set: function(c) {
            this._localTransform
              .translate(p5.Vector.mult(this._center, -1))
              .translate(c);
            this._onTransformChanged();
          }.bind(this)
        },
  
        /**
         * O centro da forma de colisão no espaço local - se este colisor for
         * pertencente a um sprite, o deslocamento do centro do colisor em relação ao centro do sprite.
         * @property offset
         * @type {p5.Vector}
         */
        'offset': {
          enumerable: true,
          get: function() {
            return this._offset.copy();
          }.bind(this),
          set: function(o) {
            this._localTransform
              .translate(p5.Vector.mult(this._offset, -1))
              .translate(o);
            this._onTransformChanged();
          }.bind(this)
        },
  
        /**
         * A rotação no espaço local do colisor, em radianos.
         * @property rotation
         * @type {number}
         */
        'rotation': {
          enumerable: true,
          get: function() {
            return this._rotation;
          }.bind(this),
          set: function(r) {
            this._localTransform
              .clear()
              .scale(this._scale)
              .rotate(r)
              .translate(this._offset);
            this._onTransformChanged();
          }.bind(this)
        },
  
        /**
         * A escala do espaço local do colisor
         * @property scale
         * @type {p5.Vector}
         */
        'scale': {
          enumerable: true,
          get: function() {
            return this._scale.copy();
          }.bind(this),
          set: function(s) {
            this._localTransform
              .clear()
              .scale(s)
              .rotate(this._rotation)
              .translate(this._offset);
            this._onTransformChanged();
          }.bind(this)
        }
      });
  
      this._onTransformChanged();
    };
  
    /**
     * Atualize este colisor com base nas propriedades de um Sprite-mãe.
     * As classes descendentes devem substituir este método para adotar as dimensões
     * do sprite se `getsDimensionsFromSprite` for verdadeiro.
     * @method updateFromSprite
     * @param {Sprite} sprite
     * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
     */
    p5.CollisionShape.prototype.updateFromSprite = function(sprite) {
      this.setParentTransform(sprite);
    };
  
    /**
     * Atualize a transformação mãe deste colisor, que por sua vez ajustará sua
     * posição, rotação e escala no espaço-mundo e recalcular os valores em cache,
     * se necessário.
     * Se um Sprite for passado como 'mãe', uma nova transformação será calculada
     * da posição/rotação/escala do sprite e usado.
     * @method setParentTransform
     * @param {p5.Transform2D|Sprite} parent
     */
    p5.CollisionShape.prototype.setParentTransform = function(parent) {
      if (parent instanceof Sprite) {
        this._parentTransform
          .clear()
          .scale(parent._getScaleX(), parent._getScaleY())
          .rotate(radians(parent.rotation))
          .translate(parent.position);
      } else if (parent instanceof p5.Transform2D) {
        this._parentTransform = parent.copy();
      } else {
        throw new TypeError('Bad argument to setParentTransform: ' + parent);
      }
      this._onTransformChanged();
    };
  
    /**
     * Recalcular propriedades em cache, vetores relevantes, etc. quando pelo menos uma
     * das transformações da forma mudar. A base CollisionShape (e PointCollider)
     * só precisa recalcular o centro da forma, mas outras formas podem precisar
     * sobrescrever este método e fazer recomputações adicionais.
     * @method _onTransformChanged
     * @protected
     */
    p5.CollisionShape.prototype._onTransformChanged = function() {
      // Recompute propriedades internas a partir de transformações
  
      // Rotação no espaço local
      this._rotation = this._localTransform.getRotation();
  
      // Escala no espaço local
      this._scale = this._localTransform.getScale();
  
      // Deslocamento no espaço local
      this._offset
        .set(0, 0)
        .transform(this._localTransform);
  
      // Centro no espaço-mundo
      this._center
        .set(this._offset.x, this._offset.y)
        .transform(this._parentTransform);
    };
  
    /**
     * Calcule o menor movimento necessário para mover esta forma de colisão de uma
     * outra forma de colisão. Se as formas não estiverem sobrepostas, volta um
     * vetor zero para indicar que nenhum deslocamento é necessário.
     * @method collide
     * @param {p5.CollisionShape} other
     * @return {p5.Vector}
     */
    p5.CollisionShape.prototype.collide = function(other) {
      var displacee = this, displacer = other;
  
      // Calcule um vetor de deslocamento usando o Teorema do Eixo de Separação
      // (Válido apenas para formas convexas)
      //
      // Se existe uma linha (eixo) na qual as projeções ortogonais das duas formas
      // não se sobrepõem, então as formas não se sobrepõem. Se as projeções
      // das formas se sobrepõem em todos os eixos candidatos, o eixo que tinha o
      // a menor sobreposição nos dá o menor deslocamento possível.
      //
      // @see http://www.dyn4j.org/2010/01/sat/
      var smallestOverlap = Infinity;
      var smallestOverlapAxis = null;
  
      // Aceleramos as coisas com a suposição adicional de que todas as formas
      // de colisão são centrosimétricas: círculos, elipses e retângulos
      // estão OK. Isso nos permite comparar apenas os raios das formas com a
      // distância entre seus centros, mesmo para formas não circulares.
      // Outras formas convexas (triângulos, pentágonos) exigirão um uso
      // mais complexo das posições de suas projeções no eixo.
      var deltaOfCenters = p5.Vector.sub(displacer.center, displacee.center);
  
      // Acontece que só precisamos verificar alguns eixos, definidos pelas formas
      // para serem verificado. Para um polígono, a normal de cada face é possível
      // eixo de separação.
      var candidateAxes = p5.CollisionShape._getCandidateAxesForShapes(displacee, displacer);
      var axis, deltaOfCentersOnAxis, distanceOfCentersOnAxis;
      for (var i = 0; i < candidateAxes.length; i++) {
        axis = candidateAxes[i];
  
        // Se a distância entre os centros da forma projetada no
        // eixo de separação for maior do que os raios combinados das formas
        // projetadas no eixo, as formas não se sobrepõem neste eixo.
        deltaOfCentersOnAxis = p5.Vector.project(deltaOfCenters, axis);
        distanceOfCentersOnAxis = deltaOfCentersOnAxis.mag();
        var r1 = displacee._getRadiusOnAxis(axis);
        var r2 = displacer._getRadiusOnAxis(axis);
        var overlap = r1 + r2 - distanceOfCentersOnAxis;
        if (overlap <= 0) {
          // Essas formas são separadas ao longo deste eixo.
          // Early-out, retornando um deslocamento de vetor zero.
          return new p5.Vector();
        } else if (overlap < smallestOverlap) {
          // Esta é a menor sobreposição que encontramos até agora - armazene algumas
          // informações sobre ela, que podemos usar para fornecer o menor
          // deslocamento quando terminarmos.
          smallestOverlap = overlap;
          // Normalmente usamos o delta dos centros, o que nos dá a direção ao longo
          // com um eixo. No caso raro de os centros se sobreporem exatamente,
          // apenas use o eixo original
          if (deltaOfCentersOnAxis.x === 0 && deltaOfCentersOnAxis.y === 0) {
            smallestOverlapAxis = axis;
          } else {
            smallestOverlapAxis = deltaOfCentersOnAxis;
          }
        }
      }
  
      // Se fizermos isso aqui, nos sobreporemos em todos os eixos possíveis e
     // podemos calcular o menor vetor que irá deslocar isso de outro.
      return smallestOverlapAxis.copy().setMag(-smallestOverlap);
    };
  
  
    /**
     * Verifique se esta forma se sobrepõe a outra.
     * @method overlap
     * @param {p5.CollisionShape} other
     * @return {boolean}
     */
    p5.CollisionShape.prototype.overlap = function(other) {
      var displacement = this.collide(other);
      return displacement.x !== 0 || displacement.y !== 0;
    };
  
    /**
     * @method _getCanididateAxesForShapes
     * @private
     * @static
     * @param {p5.CollisionShape} shape1
     * @param {p5.CollisionShape} shape2
     * @return {Array.<p5.Vector>}
     */
    p5.CollisionShape._getCandidateAxesForShapes = function(shape1, shape2) {
      var axes = shape1._getCandidateAxes(shape2)
        .concat(shape2._getCandidateAxes(shape1))
        .map(function(axis) {
          if (axis.x === 0 && axis.y === 0) {
            return p5.CollisionShape.X_AXIS;
          }
          return axis;
        });
      return deduplicateParallelVectors(axes);
    };
  
    /*
     * Reduz uma matriz de vetores a um conjunto de eixos únicos (ou seja, dois vetores
     * na matriz não devem ser paralelos).
     * @param {Array.<p5.Vector>} matriz
     * @return {Array}
     */
    function deduplicateParallelVectors(array) {
      return array.filter(function(item, itemPos) {
        return !array.some(function(other, otherPos) {
          return itemPos < otherPos && item.isParallel(other);
        });
      });
    }
  
    /**
     * Calcula os eixos de separação candidatos em relação a outro objeto.
     * Substitua este método nas subclasses para implementar o comportamento de colisão.
     * @method _getCandidateAxes
     * @protected
     * @return {Array.<p5.Vector>}
     */
    p5.CollisionShape.prototype._getCandidateAxes = function() {
      return [];
    };
  
    /**
     * Obtenha o raio desta forma (metade da largura de sua projeção) ao longo do eixo fornecido.
     * Substitua este método nas subclasses para implementar o comportamento de colisão.
     * @method _getRadiusOnAxis
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.CollisionShape.prototype._getRadiusOnAxis = function() {
      return 0;
    };
  
    /**
     * Obtenha o raio mínimo da forma em qualquer eixo para verificações de tunelamento.
     * @method _getMinRadius
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.CollisionShape.prototype._getMinRadius = function() {
      return 0;
    };
  
    /**
     * @property X_AXIS
     * @type {p5.Vector}
     * @static
     * @final
     */
    p5.CollisionShape.X_AXIS = new p5.Vector(1, 0);
  
    /**
     * @property Y_AXIS
     * @type {p5.Vector}
     * @static
     * @final
     */
    p5.CollisionShape.Y_AXIS = new p5.Vector(0, 1);
  
    /**
     * @property WORLD_AXES
     * @type {Array.<p5.Vector>}
     * @static
     * @final
     */
    p5.CollisionShape.WORLD_AXES = [
      p5.CollisionShape.X_AXIS,
      p5.CollisionShape.Y_AXIS
    ];
  
    /**
     * Obtenha informações de limites alinhados ao eixo do espaço-mundo para esta forma de colisão.
     * Usado principalmente para quadtree.
     * @method getBoundingBox
     * @return {{top: number, bottom: number, left: number, right: number, width: number, height: number}}
     */
    p5.CollisionShape.prototype.getBoundingBox = function() {
      var radiusOnX = this._getRadiusOnAxis(p5.CollisionShape.X_AXIS);
      var radiusOnY = this._getRadiusOnAxis(p5.CollisionShape.Y_AXIS);
      return {
        top: this.center.y - radiusOnY,
        bottom: this.center.y + radiusOnY,
        left: this.center.x - radiusOnX,
        right: this.center.x + radiusOnX,
        width: radiusOnX * 2,
        height: radiusOnY * 2
      };
    };
  
    /**
     * Uma forma de colisão de ponto, usada para detectar vetores de sobreposição e deslocamento
     * contra outras formas de colisão.
     * @class p5.PointCollider
     * @constructor
     * @extends p5.CollisionShape
     * @param {p5.Vector} center
     */
    p5.PointCollider = function(center) {
      p5.CollisionShape.call(this, center);
    };
    p5.PointCollider.prototype = Object.create(p5.CollisionShape.prototype);
  
    /**
     * Constrói um novo PointCollider com determinado deslocamento para o sprite fornecido.
     * @method createFromSprite
     * @static
     * @param {Sprite} sprite
     * @param {p5.Vector} [offset] from the sprite's center
     * @return {p5.PointCollider}
     */
    p5.PointCollider.createFromSprite = function(sprite, offset) {
      // Crie a forma de colisão no deslocamento transformado
      var shape = new p5.PointCollider(offset);
      shape.setParentTransform(sprite);
      return shape;
    };
  
    /**
     * Depurar-desenhar este colisor de pontos
     * @method draw
     * @param {p5} sketch instância para usar para desenhar
     */
    p5.PointCollider.prototype.draw = function(sketch) {
      sketch.push();
      sketch.rectMode(sketch.CENTER);
      sketch.translate(this.center.x, this.center.y);
      sketch.noStroke();
      sketch.fill(0, 255, 0);
      sketch.ellipse(0, 0, 2, 2);
      sketch.pop();
    };
  
    /**
     * Uma forma de colisão de círculo, usada para detectar vetores de sobreposição e deslocamento
     * com outras formas de colisão.
     * @class p5.CircleCollider
     * @constructor
     * @extends p5.CollisionShape
     * @param {p5.Vector} center
     * @param {number} radius
     */
    p5.CircleCollider = function(center, radius) {
      p5.CollisionShape.call(this, center);
  
      /**
       * O raio fora de escala do colisor de círculo.
       * @property radius
       * @type {number}
       */
      this.radius = radius;
  
      /**
       * Raio final deste círculo após ser dimensionado pelas transformações mãe e local,
       * armazenado em cache para que não o recalculemos o tempo todo.
       * @property _scaledRadius
       * @type {number}
       * @private
       */
      this._scaledRadius = 0;
  
      this._computeScaledRadius();
    };
    p5.CircleCollider.prototype = Object.create(p5.CollisionShape.prototype);
  
    /**
     * Construa um novo CircleCollider com determinado deslocamento para o sprite fornecido.
     * @method createFromSprite
     * @static
     * @param {Sprite} sprite
     * @param {p5.Vector} [offset] do centro do sprite
     * @param {number} [radius]
     * @return {p5.CircleCollider}
     */
    p5.CircleCollider.createFromSprite = function(sprite, offset, radius) {
      var customSize = typeof radius === 'number';
      var shape = new p5.CircleCollider(
        offset,
        customSize ? radius : 1
      );
      shape.getsDimensionsFromSprite = !customSize;
      shape.updateFromSprite(sprite);
      return shape;
    };
  
    /**
     * Atualize este colisor com base nas propriedades de um Sprite-mãe.
     * @method updateFromSprite
     * @param {Sprite} sprite
     * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
     */
    p5.CircleCollider.prototype.updateFromSprite = function(sprite) {
      if (this.getsDimensionsFromSprite) {
        if (sprite.animation) {
          this.radius = Math.max(sprite.animation.getWidth(), sprite.animation.getHeight())/2;
        } else {
          this.radius = Math.max(sprite.width, sprite.height)/2;
        }
      }
      this.setParentTransform(sprite);
    };
  
    /**
     * Recalcular propriedades em cache, vetores relevantes, etc. quando pelo menos uma
     * das transformações da forma mudar. A base CollisionShape (e PointCollider)
     * só precisa recalcular o centro da forma, mas outras formas podem precisar
     * sobrescrever este método e fazer recomputações adicionais.
     * @method _onTransformChanged
     * @protected
     */
    p5.CircleCollider.prototype._onTransformChanged = function() {
      p5.CollisionShape.prototype._onTransformChanged.call(this);
      this._computeScaledRadius();
    };
  
    /**
     * Chame para atualizar o valor do raio escalado em cache.
     * @method _computeScaledRadius
     * @private
     */
    p5.CircleCollider.prototype._computeScaledRadius = function() {
      this._scaledRadius = new p5.Vector(this.radius, 0)
        .transform(this._localTransform)
        .transform(this._parentTransform)
        .sub(this.center)
        .mag();
    };
  
    /**
     * Depure-desenhe esta forma de colisão.
     * @method draw
     * @param {p5} sketch instância para usar para desenhar
     */
    p5.CircleCollider.prototype.draw = function(sketch) {
      sketch.push();
      sketch.noFill();
      sketch.stroke(0, 255, 0);
      sketch.rectMode(sketch.CENTER);
      sketch.ellipse(this.center.x, this.center.y, this._scaledRadius*2, this._scaledRadius*2);
      sketch.pop();
    };
  
      /**
     * Substitui CollisionShape.setParentTransform
     * Atualize a transformação mãe deste colisor, que por sua vez ajustará sua
     * posição, rotação e escala no espaço-mundo e recalcular os valores em cache
     * se necessário.
     * Se um Sprite for passado como 'mãe', uma nova transformação será calculada
     * da posição/rotação/escala do sprite e usado.
     * Use o máximo dos valores das escalas x e y para que o círculo englobe o sprite.
     * @method setParentTransform
     * @param {p5.Transform2D|Sprite} parent
     */
    p5.CircleCollider.prototype.setParentTransform = function(parent) {
      if (parent instanceof Sprite) {
        this._parentTransform
          .clear()
          .scale(Math.max(parent._getScaleX(), parent._getScaleY()))
          .rotate(radians(parent.rotation))
          .translate(parent.position);
      } else if (parent instanceof p5.Transform2D) {
        this._parentTransform = parent.copy();
      } else {
        throw new TypeError('Bad argument to setParentTransform: ' + parent);
      }
      this._onTransformChanged();
    };
  
    /**
     * Calcula os eixos de separação candidatos em relação a outro objeto.
     * @method _getCandidateAxes
     * @protected
     * @param {p5.CollisionShape} other
     * @return {Array.<p5.Vector>}
     */
    p5.CircleCollider.prototype._getCandidateAxes = function(other) {
      // Um círculo tem infinitos candidatos potenciais de eixos, então aqueles que escolhemos
      // dependem do que estamos colidindo.
  
      // FAZER: Se pudermos pedir à outra forma uma lista de vértices, então podemos
       //       generalizar este algoritmo usando sempre o mais próximo, e
       //       remover o conhecimento especial de OBB e AABB.
  
      if (other instanceof p5.OrientedBoundingBoxCollider || other instanceof p5.AxisAlignedBoundingBoxCollider) {
        // Existem quatro eixos de separação possíveis com uma caixa - um para cada
        // um de seus vértices, passando pelo centro do círculo.
        // Precisamos do mais próximo.
        var smallestSquareDistance = Infinity;
        var axisToClosestVertex = null;
  
        // Gere o conjunto de vértices para a outra forma
        var halfDiagonals = other.halfDiagonals;
        [
          p5.Vector.add(other.center, halfDiagonals[0]),
          p5.Vector.add(other.center, halfDiagonals[1]),
          p5.Vector.sub(other.center, halfDiagonals[0]),
          p5.Vector.sub(other.center, halfDiagonals[1])
        ].map(function(vertex) {
          // Transforme cada vértice em um vetor do centro deste colisor para
          // aquele vértice, que define um eixo que podemos querer verificar.
          return vertex.sub(this.center);
        }.bind(this)).forEach(function(vector) {
          // Descubra qual vértice está mais próximo e use seu eixo
          var squareDistance = vector.magSq();
          if (squareDistance < smallestSquareDistance) {
            smallestSquareDistance = squareDistance;
            axisToClosestVertex = vector;
          }
        });
        return [axisToClosestVertex];
      }
  
      // Ao verificar outro círculo ou um ponto, só precisamos verificar o
      // eixo através dos centros de ambas as formas.
      return [p5.Vector.sub(other.center, this.center)];
    };
  
    /**
     * Obtenha o raio desta forma (metade da largura de sua projeção) ao longo do eixo fornecido.
     * @method _getRadiusOnAxis
     * @protected
     * @return {number}
     */
    p5.CircleCollider.prototype._getRadiusOnAxis = function() {
      return this._scaledRadius;
    };
  
    /**
     * Obtenha o raio mínimo da forma em qualquer eixo para verificações de tunelamento.
     * @method _getMinRadius
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.CircleCollider.prototype._getMinRadius = function() {
      return this._scaledRadius;
    };
  
    /**
     * Uma forma de colisão de caixa delimitadora alinhada ao eixo (AABB), usada para detectar a sobreposição
     * e calcular vetores de deslocamento mínimo com outras formas de colisão.
     *
     * Não pode ser girado - daí o nome. Você pode usar isso no lugar de um
     * OBB porque simplifica parte da matemática e pode melhorar o desempenho.
     *
     * @class p5.AxisAlignedBoundingBoxCollider
     * @constructor
     * @extends p5.CollisionShape
     * @param {p5.Vector} center
     * @param {number} width
     * @param {number} height
     */
    p5.AxisAlignedBoundingBoxCollider = function(center, width, height) {
      p5.CollisionShape.call(this, center);
  
      /**
       * Largura da caixa sem escala.
       * @property _width
       * @private
       * @type {number}
       */
      this._width = width;
  
      /**
       * Altura da caixa sem escala.
       * @property _width
       * @private
       * @type {number}
       */
      this._height = height;
  
      /**
       * Meias diagonais em cache, usadas para calcular um raio projetado.
       * Já transformado em espaço-mundo.
       * @property _halfDiagonals
       * @private
       * @type {Array.<p5.Vector>}
       */
      this._halfDiagonals = [];
  
      Object.defineProperties(this, {
  
        /**
         * A largura não transformada do colisor de caixa.
         * Recomputa diagonais quando definido.
         * @property width
         * @type {number}
         */
        'width': {
          enumerable: true,
          get: function() {
            return this._width;
          }.bind(this),
          set: function(w) {
            this._width = w;
            this._halfDiagonals = this._computeHalfDiagonals();
          }.bind(this)
        },
  
        /**
         * A altura não transformada do colisor de caixa.
         * Recomputa diagonais quando definido.
         * @property height
         * @type {number}
         */
        'height': {
          enumerable: true,
          get: function() {
            return this._height;
          }.bind(this),
          set: function(h) {
            this._height = h;
            this._halfDiagonals = this._computeHalfDiagonals();
          }.bind(this)
        },
  
        /**
         * Dois vetores representando meias diagonais adjacentes da caixa em suas
         * dimensões e orientação atuais.
         * @property halfDiagonals
         * @readOnly
         * @type {Array.<p5.Vector>}
         */
        'halfDiagonals': {
          enumerable: true,
          get: function() {
            return this._halfDiagonals;
          }.bind(this)
        }
      });
  
      this._computeHalfDiagonals();
    };
    p5.AxisAlignedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);
  
    /**
     * Constrói um novo AxisAlignedBoundingBoxCollider com determinado deslocamento para o sprite fornecido.
     * @method createFromSprite
     * @static
     * @param {Sprite} sprite
     * @param {p5.Vector} [offset] do centro do sprite
     * @return {p5.CircleCollider}
     */
    p5.AxisAlignedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height) {
      var customSize = typeof width === 'number' && typeof height === 'number';
      var box = new p5.AxisAlignedBoundingBoxCollider(
        offset,
        customSize ? width : 1,
        customSize ? height : 1
      );
      box.getsDimensionsFromSprite = !customSize;
      box.updateFromSprite(sprite);
      return box;
    };
  
    /**
     * Atualize este colisor com base nas propriedades de um Sprite-mãe.
     * @method updateFromSprite
     * @param {Sprite} sprite
     * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
     */
    p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite = function(sprite) {
      if (this.getsDimensionsFromSprite) {
        if (sprite.animation) {
          this._width = sprite.animation.getWidth();
          this._height = sprite.animation.getHeight();
        } else {
          this._width = sprite.width;
          this._height = sprite.height;
        }
      }
      this.setParentTransform(sprite);
    };
  
    /**
     * Recalcular propriedades em cache, vetores relevantes, etc. quando pelo menos uma
     * das transformações da forma mudar. A base CollisionShape (e PointCollider)
     * só precisa recalcular o centro da forma, mas outras formas podem precisar
     * sobrescrever este método e fazer recomputações adicionais.
     * @method _onTransformChanged
     * @protected
     */
    p5.AxisAlignedBoundingBoxCollider.prototype._onTransformChanged = function() {
      p5.CollisionShape.prototype._onTransformChanged.call(this);
      this._computeHalfDiagonals();
    };
  
    /**
     * Recompute os vetores da meia diagonal desta caixa delimitadora.
     * @method _computeHalfDiagonals
     * @private
     * @return {Array.<p5.Vector>}
     */
    p5.AxisAlignedBoundingBoxCollider.prototype._computeHalfDiagonals = function() {
      // Transformamos o retângulo (que pode ser redimensionado e girado) e então calculamos
      // uma caixa delimitadora alinhada ao eixo _ em torno_ dela.
      var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
      var transformedDiagonals = [
        new p5.Vector(this._width / 2, -this._height / 2),
        new p5.Vector(this._width / 2, this._height / 2),
        new p5.Vector(-this._width / 2, this._height / 2)
      ].map(function(vertex) {
        return vertex.transform(composedTransform).sub(this.center);
      }.bind(this));
  
      var halfWidth = Math.max(
        Math.abs(transformedDiagonals[0].x),
        Math.abs(transformedDiagonals[1].x)
      );
      var halfHeight = Math.max(
        Math.abs(transformedDiagonals[1].y),
        Math.abs(transformedDiagonals[2].y)
      );
  
      this._halfDiagonals = [
        new p5.Vector(halfWidth, -halfHeight),
        new p5.Vector(halfWidth, halfHeight)
      ];
    };
  
    /**
     * Depure-draw esse colisor.
     * @method draw
     * @param {p5} sketch - instância p5 para usar para desenhar
     */
    p5.AxisAlignedBoundingBoxCollider.prototype.draw = function(sketch) {
      sketch.push();
      sketch.rectMode(sketch.CENTER);
      sketch.translate(this.center.x, this.center.y);
      sketch.noFill();
      sketch.stroke(0, 255, 0);
      sketch.strokeWeight(1);
      sketch.rect(0, 0, Math.abs(this._halfDiagonals[0].x) * 2, Math.abs(this._halfDiagonals[0].y) * 2);
      sketch.pop();
    };
  
    /**
     * Calcula os eixos de separação candidatos em relação a outro objeto.
     * @method _getCandidateAxes
     * @protected
     * @return {Array.<p5.Vector>}
     */
    p5.AxisAlignedBoundingBoxCollider.prototype._getCandidateAxes = function() {
      return p5.CollisionShape.WORLD_AXES;
    };
  
    /**
     * Obtenha o raio desta forma (metade da largura de sua projeção) ao longo do eixo fornecido.
     * @method _getRadiusOnAxis
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis = function(axis) {
      // Como projetar um retângulo em um eixo:
      // Projete os vetores do canto central para dois cantos adjacentes (armazenados em cache aqui)
      // no eixo. A maior magnitude dos dois é o raio de sua projeção.
      return Math.max(
        p5.Vector.project(this._halfDiagonals[0], axis).mag(),
        p5.Vector.project(this._halfDiagonals[1], axis).mag());
    };
  
    /**
     * Obtenha o raio mínimo da forma em qualquer eixo para verificações de tunelamento.
     * @method _getMinRadius
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius = function() {
      return Math.min(this._width, this._height);
    };
  
    /**
     * Uma forma de colisão de caixa delimitadora orientada (OBB), usada para detectar sobreposição e
     * calcular vetores de deslocamento mínimo com outras formas de colisão.
     * @class p5.OrientedBoundingBoxCollider
     * @constructor
     * @extends p5.CollisionShape
     * @param {p5.Vector} center do retângulo no espaço-mundo
     * @param {number} width do retângulo (quando não girado)
     * @param {number} height do retângulo (quando não girado)
     * @param {number} rotation sobre o centro, em radianos
     */
    p5.OrientedBoundingBoxCollider = function(center, width, height, rotation) {
      p5.CollisionShape.call(this, center, rotation);
  
      /**
       * Largura da caixa sem escala.
       * @property _width
       * @private
       * @type {number}
       */
      this._width = width;
  
      /**
       * Altura da caixa sem escala.
       * @property _width
       * @private
       * @type {number}
       */
      this._height = height;
  
      /**
       * Eixos de separação em cache, esta forma contribui para uma colisão.
       * @property _potentialAxes
       * @private
       * @type {Array.<p5.Vector>}
       */
      this._potentialAxes = [];
  
      /**
       * Meias diagonais em cache, usadas para calcular um raio projetado.
       * Já transformado em espaço-mundo.
       * @property _halfDiagonals
       * @private
       * @type {Array.<p5.Vector>}
       */
      this._halfDiagonals = [];
  
      Object.defineProperties(this, {
  
        /**
         * A largura não girada do colisor de caixa.
         * Recomputa diagonais quando definido.
         * @property width
         * @type {number}
         */
        'width': {
          enumerable: true,
          get: function() {
            return this._width;
          }.bind(this),
          set: function(w) {
            this._width = w;
            this._onTransformChanged();
          }.bind(this)
        },
  
        /**
         * A altura não girada do colisor de caixa.
         * Recomputa diagonais quando definido.
         * @property height
         * @type {number}
         */
        'height': {
          enumerable: true,
          get: function() {
            return this._height;
          }.bind(this),
          set: function(h) {
            this._height = h;
            this._onTransformChanged();
          }.bind(this)
        },
  
        /**
         * Dois vetores representando meias diagonais adjacentes da caixa em suas
         * dimensões e orientação atuais.
         * @property halfDiagonals
         * @readOnly
         * @type {Array.<p5.Vector>}
         */
        'halfDiagonals': {
          enumerable: true,
          get: function() {
            return this._halfDiagonals;
          }.bind(this)
        }
      });
  
      this._onTransformChanged();
    };
    p5.OrientedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);
  
    /**
     * Constrói um novo AxisAlignedBoundingBoxCollider com determinado deslocamento para o sprite fornecido.
     * @method createFromSprite
     * @static
     * @param {Sprite} sprite
     * @param {p5.Vector} [offset] do centro do sprite
     * @param {number} [width]
     * @param {number} [height]
     * @param {number} [rotation] em radianos
     * @return {p5.CircleCollider}
     */
    p5.OrientedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height, rotation) {
      var customSize = typeof width === 'number' && typeof height === 'number';
      var box = new p5.OrientedBoundingBoxCollider(
        offset,
        customSize ? width : 1,
        customSize ? height : 1,
        rotation
      );
      box.getsDimensionsFromSprite = !customSize;
      box.updateFromSprite(sprite);
      return box;
    };
  
    /**
     * Atualize este colisor com base nas propriedades de um Sprite-mãe.
     * @method updateFromSprite
     * @param {Sprite} sprite
     * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
     */
    p5.OrientedBoundingBoxCollider.prototype.updateFromSprite =
      p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite;
  
    /**
     * Supondo que este colisor seja um colisor de varredura de sprite, atualize-o com base
     * nas propriedades do sprite pai para que inclua a posição
     * atual e posição projetada do sprite.
     * @method updateSweptColliderFromSprite
     * @param {Sprite} sprite
     */
    p5.OrientedBoundingBoxCollider.prototype.updateSweptColliderFromSprite = function(sprite) {
      var vMagnitude = sprite.velocity.mag();
      var vPerpendicular = new p5.Vector(sprite.velocity.y, -sprite.velocity.x);
      this._width = vMagnitude + 2 * sprite.collider._getRadiusOnAxis(sprite.velocity);
      this._height = 2 * sprite.collider._getRadiusOnAxis(vPerpendicular);
      var newRotation = radians(sprite.getDirection());
      var newCenter = new p5.Vector(
        sprite.newPosition.x + 0.5 * sprite.velocity.x,
        sprite.newPosition.y + 0.5 * sprite.velocity.y
      );
      // Execute this.rotation = newRotation e this.center = newCenter;
      this._localTransform
        .clear()
        .scale(this._scale)
        .rotate(newRotation)
        .translate(this._offset)
        .translate(p5.Vector.mult(this._center, -1))
        .translate(newCenter);
      this._onTransformChanged();
    };
  
    /**
     * Recalcular propriedades em cache, vetores relevantes, etc. quando pelo menos uma
     * das transformações da forma mudar. A base CollisionShape (e PointCollider)
     * só precisa recalcular o centro da forma, mas outras formas podem precisar
     * sobrescrever este método e fazer recomputações adicionais.
     * @method _onTransformChanged
     * @protected
     */
    p5.OrientedBoundingBoxCollider.prototype._onTransformChanged = function() {
      p5.CollisionShape.prototype._onTransformChanged.call(this);
  
      // Transforme cada vértice pelas matrizes locais e globais
      // em seguida, use suas diferenças para determinar a largura, altura e meio-diagonais
      var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
      var transformedVertices = [
        new p5.Vector(this._width / 2, -this._height / 2),
        new p5.Vector(this._width / 2, this._height / 2),
        new p5.Vector(-this._width / 2, this._height / 2)
      ].map(function(vertex) {
        return vertex.transform(composedTransform);
      });
  
      this._halfDiagonals = [
        p5.Vector.sub(transformedVertices[0], this.center),
        p5.Vector.sub(transformedVertices[1], this.center)
      ];
  
      this._potentialAxes = [
        p5.Vector.sub(transformedVertices[1], transformedVertices[2]),
        p5.Vector.sub(transformedVertices[1], transformedVertices[0])
      ];
    };
  
    /**
     * Depure-desenhe esse colisor.
     * @method draw
     * @param {p5} sketch - instância p5 para usar para desenhar
     */
    p5.OrientedBoundingBoxCollider.prototype.draw = function(sketch) {
      var composedTransform = p5.Transform2D.mult(this._localTransform, this._parentTransform);
      var scale = composedTransform.getScale();
      var rotation = composedTransform.getRotation();
      sketch.push();
      sketch.translate(this.center.x, this.center.y);
      sketch.scale(scale.x, scale.y);
      if (sketch._angleMode === sketch.RADIANS) {
        sketch.rotate(rotation);
      } else {
        sketch.rotate(degrees(rotation));
      }
  
      sketch.noFill();
      sketch.stroke(0, 255, 0);
      sketch.strokeWeight(1);
      sketch.rectMode(sketch.CENTER);
      sketch.rect(0, 0, this._width, this._height);
      sketch.pop();
    };
  
    /**
     * Calcula os eixos de separação candidatos em relação a outro objeto.
     * @method _getCandidateAxes
     * @protected
     * @return {Array.<p5.Vector>}
     */
    p5.OrientedBoundingBoxCollider.prototype._getCandidateAxes = function() {
      // Uma caixa delimitadora orientada sempre fornece duas de suas normais de face,
      // que pré-computamos.
      return this._potentialAxes;
    };
  
    /**
     * Obtenha o raio desta forma (metade da largura de sua projeção) ao longo do eixo fornecido.
     * @method _getRadiusOnAxis
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.OrientedBoundingBoxCollider.prototype._getRadiusOnAxis =
      p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis;
    // Podemos reutilizar a versão AABB deste método porque ambos estão projetando
    // meias diagonais em cache - o mesmo código funciona.
  
    /**
     * Ao verificar o encapsulamento por meio de OrientedBoundingBoxCollider, use um
     * caso pior que zero (por exemplo, se o outro sprite estiver passando por um canto).
     * @method _getMinRadius
     * @protected
     * @param {p5.Vector} axis
     * @return {number}
     */
    p5.OrientedBoundingBoxCollider.prototype._getMinRadius =
      p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius;
  
    /**
     * Uma transformação afim 2D (translação, rotação, escala) armazenada como uma
     * matriz 3x3 que usa coordenadas homogêneas. Usado para transformar rapidamente
     * pontos ou vetores entre referenciais.
     * @class p5.Transform2D
     * @constructor
     * @extends Array
     * @param {p5.Transform2D|Array.<number>} [source]
     */
    p5.Transform2D = function(source) {
      // Armazenamos apenas os primeiros seis valores.
      // a última linha em uma matriz de transformação 2D é sempre "0 0 1" para que possamos
      // economiza espaço e acelerar certos cálculos com esta suposição.
      source = source || [1, 0, 0, 0, 1, 0];
      if (source.length !== 6) {
        throw new TypeError('Transform2D must have six components');
      }
      this.length = 6;
      this[0] = source[0];
      this[1] = source[1];
      this[2] = source[2];
      this[3] = source[3];
      this[4] = source[4];
      this[5] = source[5];
    };
    p5.Transform2D.prototype = Object.create(Array.prototype);
  
    /**
     * Redefina essa transformação para uma transformação de identidade, no local.
     * @method clear
     * @return {p5.Transform2D} essa transformação
     */
    p5.Transform2D.prototype.clear = function() {
      this[0] = 1;
      this[1] = 0;
      this[2] = 0;
      this[3] = 0;
      this[4] = 1;
      this[5] = 0;
      return this;
    };
  
    /**
     * Faça uma cópia dessa transformação.
     * @method copy
     * @return {p5.Transform2D}
     */
    p5.Transform2D.prototype.copy = function() {
      return new p5.Transform2D(this);
    };
  
    /**
     * Verifique se duas transformações são iguais.
     * @method equals
     * @param {p5.Transform2D|Array.<number>} other
     * @return {boolean}
     */
    p5.Transform2D.prototype.equals = function(other) {
      if (!(other instanceof p5.Transform2D || Array.isArray(other))) {
        return false; // Nunca igual a outros tipos.
      }
  
      for (var i = 0; i < 6; i++) {
        if (this[i] !== other[i]) {
          return false;
        }
      }
      return true;
    };
  
    /**
     * Multiplique duas transformações, combinando-as.
     * Não modifica as transformações originais. Atribui o resultado ao argumento dest se
     * fornecido e o devolve. Caso contrário, retorna uma nova transformação.
     * @method mult
     * @static
     * @param {p5.Transform2D|Array.<number>} t1
     * @param {p5.Transform2D|Array.<number>} t2
     * @param {p5.Transform2D} [dest]
     * @return {p5.Transform2D}
     */
    p5.Transform2D.mult = function(t1, t2, dest) {
      dest = dest || new p5.Transform2D();
  
      // Capture valores de matrizes originais em variáveis locais, no caso de um deles
      // seja o que estamos alterando.
      var t1_0, t1_1, t1_2, t1_3, t1_4, t1_5;
      t1_0 = t1[0];
      t1_1 = t1[1];
      t1_2 = t1[2];
      t1_3 = t1[3];
      t1_4 = t1[4];
      t1_5 = t1[5];
  
      var t2_0, t2_1, t2_2, t2_3, t2_4, t2_5;
      t2_0 = t2[0];
      t2_1 = t2[1];
      t2_2 = t2[2];
      t2_3 = t2[3];
      t2_4 = t2[4];
      t2_5 = t2[5];
  
      dest[0] = t1_0*t2_0 + t1_1*t2_3;
      dest[1] = t1_0*t2_1 + t1_1*t2_4;
      dest[2] = t1_0*t2_2 + t1_1*t2_5 + t1_2;
  
      dest[3] = t1_3*t2_0 + t1_4*t2_3;
      dest[4] = t1_3*t2_1 + t1_4*t2_4;
      dest[5] = t1_3*t2_2 + t1_4*t2_5 + t1_5;
  
      return dest;
    };
  
    /**
     * Multiplique esta transformação por outra, combinando-as.
     * Modifica esta transformação e a retorna.
     * @method mult
     * @param {p5.Transform2D|Float32Array|Array.<number>} other
     * @return {p5.Transform2D}
     */
    p5.Transform2D.prototype.mult = function(other) {
      return p5.Transform2D.mult(this, other, this);
    };
  
    /**
     * Modifique essa transformação, traduzindo-a em uma certa quantia.
     * Retorna esta transformação.
     * @method translate
     * @return {p5.Transform2D}
     * @example
     *     // Duas maneiras diferentes de chamar esse método.
     *     var t = new p5.Transform();
     *     // 1. Dois números
     *     t.translate(x, y);
     *     // 2. Um vetor
     *     t.translate(new p5.Vector(x, y));
     */
    p5.Transform2D.prototype.translate = function(arg0, arg1) {
      var x, y;
      if (arg0 instanceof p5.Vector) {
        x = arg0.x;
        y = arg0.y;
      } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
        x = arg0;
        y = arg1;
      } else {
        var args = '';
        for (var i = 0; i < arguments.length; i++) {
          args += arguments[i] + ', ';
        }
        throw new TypeError('Invalid arguments to Transform2D.translate: ' + args);
      }
      return p5.Transform2D.mult([
        1, 0, x,
        0, 1, y
      ], this, this);
    };
  
    /**
     * Recupere a tradução resolvida desta transformação.
     * @method getTranslation
     * @return {p5.Vector}
     */
    p5.Transform2D.prototype.getTranslation = function() {
      return new p5.Vector(this[2], this[5]);
    };
  
    /**
     * Modifique esta transformação, escalando-a em uma certa quantidade.
     * Retorna esta transformação.
     * @method scale
     * @return {p5.Transform2D}
     * @example
     *     // Três maneiras diferentes de chamar esse método.
     *     var t = new p5.Transform();
     *     // 1. Um valor escalar
     *     t.scale(uniformScale);
     *     // 1. Dois valores escalares
     *     t.scale(scaleX, scaleY);
     *     // 2. Um vetor
     *     t.translate(new p5.Vector(scaleX, scaleY));
     */
    p5.Transform2D.prototype.scale = function(arg0, arg1) {
      var sx, sy;
      if (arg0 instanceof p5.Vector) {
        sx = arg0.x;
        sy = arg0.y;
      } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
        sx = arg0;
        sy = arg1;
      } else if (typeof arg0 === 'number') {
        sx = arg0;
        sy = arg0;
      } else {
        throw new TypeError('Invalid arguments to Transform2D.scale: ' + arguments);
      }
      return p5.Transform2D.mult([
        sx, 0, 0,
        0, sy, 0
      ], this, this);
    };
  
    /**
     * Recupere o vetor de escala desta transformação.
     * @method getScale
     * @return {p5.Vector}
     */
    p5.Transform2D.prototype.getScale = function() {
      var a = this[0], b = this[1],
          c = this[3], d = this[4];
      return new p5.Vector(
        sign(a) * Math.sqrt(a*a + b*b),
        sign(d) * Math.sqrt(c*c + d*d)
      );
    };
  
    /*
     * Retorne -1, 0 ou 1 dependendo se um número é negativo, zero ou positivo.
     */
    function sign(x) {
      x = +x; // converter para um número
      if (x === 0 || isNaN(x)) {
        return Number(x);
      }
      return x > 0 ? 1 : -1;
    }
  
    /**
     * Modifique esta transformação, girando-a em uma certa quantidade.
     * @method rotate
     * @param {number} radians
     * @return {p5.Transform2D}
     */
    p5.Transform2D.prototype.rotate = function(radians) {
      // Sentido horário!
      if (typeof radians !== 'number') {
        throw new TypeError('Invalid arguments to Transform2D.rotate: ' + arguments);
      }
      var sinR = Math.sin(radians);
      var cosR = Math.cos(radians);
      return p5.Transform2D.mult([
        cosR, -sinR, 0,
        sinR, cosR, 0
      ], this, this);
    };
  
    /**
     * Recupere o ângulo desta transformação em radianos.
     * @method getRotation
     * @return {number}
     */
    p5.Transform2D.prototype.getRotation = function() {
      // consulte http://math.stackexchange.com/a/13165
      return Math.atan2(-this[1], this[0]);
    };
  
    /**
     * Aplica uma matriz de transformação 2D (usando coordenadas homogêneas, então 3x3)
     * em um Vector2 (<x, y, 1>) e retorna um novo vetor2.
     * @method transform
     * @for p5.Vector
     * @static
     * @param {p5.Vector} v
     * @param {p5.Transform2D} t
     * @return {p5.Vector} um novo vetor
     */
    p5.Vector.transform = function(v, t) {
      return v.copy().transform(t);
    };
  
    /**
     * Transforma esse vetor por uma matriz de transformação 2D.
     * @method transform
     * @for p5.Vector
     * @param {p5.Transform2D} transform
     * @return {p5.Vector} isso, depois da mudança
     */
    p5.Vector.prototype.transform = function(transform) {
      // Nota: Nós trapaceamos um monte aqui, já que isso é apenas 2D!
      // Use um método diferente se estiver procurando por uma verdadeira multiplicação de matrizes.
      var x = this.x;
      var y = this.y;
      this.x = transform[0]*x + transform[1]*y + transform[2];
      this.y = transform[3]*x + transform[4]*y + transform[5];
      return this;
    };
  
  }));
  