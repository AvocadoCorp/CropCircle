define(['jquery'], function($) {
  function CropCircle(elem, options) {
    var $el = $(elem);

    if('ontouchstart' in document.documentElement) {
      $el.addClass('crop-circle-touch');

      if(options.showHelp) {
        $el.append('<div class="crop-circle-help">Drag the cropping '+ (options.circle? 'circle' : 'box') +' with two fingers. Pinch to resize.</div>');
      }
    }

    var cropFrame = $('<div class="crop-circle-crop-frame"></div>');
    var handles = [];

    // in CSS position: absolute offset-style coords
    var frameRect = {
      top: (options.top || options.top === 0) ? options.top : 100,
      left: (options.left || options.left === 0) ? options.left : 100,
      bottom: (options.bottom || options.bottom === 0) ? options.bottom : 100,
      right: (options.right || options.right === 0) ? options.right : 100
    };

    var oldFrameRect = {
      top: frameRect.top,
      left: frameRect.left,
      bottom: frameRect.bottom,
      right: frameRect.right
    };

    var elWidth = $el.width();
    var elHeight = $el.height();

    var boundaries = getBoundaries();

    var mouseIsDown = false;
    var moveHandler = null;

    var clickOffset = null;

    function maybeCallOnFrameChanged() {
      if (options.onFrameChanged) {
        options.onFrameChanged({
          top: frameRect.top,
          left: frameRect.left,
          bottom: frameRect.bottom,
          right: frameRect.right,
          width: (elWidth - frameRect.right) - frameRect.left,
          height: (elHeight - frameRect.bottom) - frameRect.top
        });
      }
    }

    /**
     * General event handling
     */

    function mouseUp() {
      mouseIsDown = false;
      moveHandler = null;
      clickOffset = null;
      maybeCallOnFrameChanged();
    }

    function mouseMove(e) {
      if (moveHandler) {
        return moveHandler(e);
      }
    }

    var resizeLast;
    var resizeAnchor;

    var touchStart = function (e) {
      if (options.noTouchScroll && e.touches.length == 1) {
        cropFrameMousedown(e.touches[0]);
      }
      else if (e.touches.length == 2) {
        resizeLast = { x: e.touches[0].pageX, y: e.touches[0].pageY };
        resizeAnchor = { x: e.touches[1].pageX, y: e.touches[1].pageY };
        moveHandler = resizeTouchMove;
      }
    };

    var touchMove = function (e) {
      if (moveHandler) {
        moveHandler.apply(undefined, e.touches);
        event.preventDefault();
      }
    };

    $('body').mouseup(mouseUp).mousemove(mouseMove);
    cropFrame[0].addEventListener('touchstart', touchStart);
    $('body')[0].addEventListener('touchmove', touchMove);
    $('body')[0].addEventListener('touchend', mouseUp);

    this.remove = function() {
      $('body').off('mouseup', mouseUp).off('mousemove', mouseMove);
      cropFrame[0].removeEventListener('touchstart', touchStart);
      $('body')[0].removeEventListener('touchmove', touchMove);
      $('body')[0].removeEventListener('touchend', mouseUp);

      $(window).off('resize', browserResized);
      containerObserver.disconnect();

      cropFrame.remove();
      $el.find('.crop-circle-help').remove();
    };

    function getBoundaries() {
      var imageEl = options.image ? $(options.image) : $el;

      // check for marking of an altered EXIF orientation
      var orientation = imageEl.data('exif-orientation') || 0;

      var imgWidth, imgHeight;

      // orientations > 4 have exchanged width/height:
      if(orientation > 4) {
        imgWidth = imageEl.height();
        imgHeight = imageEl.width();
      }
      else {
        imgWidth = imageEl.width();
        imgHeight = imageEl.height();
      }

      // can't use elWidth or elHeight in here since we're in the process of updating them
      var bounds = imageEl.offset();

      bounds.top -= $el.offset().top;
      bounds.left -= $el.offset().left;
      bounds.bottom = $el.height() - imgHeight - bounds.top;
      bounds.right = $el.width() - imgWidth - bounds.left;
      bounds.width = imgWidth;
      bounds.height = imgHeight;
      bounds.sideways = orientation > 4;
      return bounds;
    }

    //TODO: explicitly force calling this on init
    function handleBoundsChange() {
      var newWidth = $el.width();
      var newHeight = $el.height();

      var oldBounds = boundaries;
      boundaries = getBoundaries();
      var sx = boundaries.width/oldBounds.width;
      var sy = boundaries.height/oldBounds.height;

      var newFrame = {
        top: boundaries.top + (frameRect.top - oldBounds.top)*sy,
        left: boundaries.left + (frameRect.left - oldBounds.left)*sx,
        bottom: boundaries.bottom + (frameRect.bottom - oldBounds.bottom)*sy,
        right: boundaries.right + (frameRect.right - oldBounds.right)*sx
      };

      elWidth = newWidth;
      elHeight = newHeight;

      //noInitialBounds means that the initial frame position is invalid because
      //the dimensions of the image weren't set on init. Instead, fix it here:
      if(!options.noInitialBounds) {
        moveFrame(null, newFrame);
      }
      else {
        if(options.forceAspect) {
          var imageAspect = boundaries.width / boundaries.height;
          var adjust;

          // we're wider than the crop area, maximize height and center horizontally:
          if(imageAspect > options.forceAspect) {
            adjust = (boundaries.width - boundaries.height*options.forceAspect)/2;
            newFrame.top = boundaries.top;
            newFrame.bottom = boundaries.bottom;
            newFrame.left = boundaries.left + adjust;
            newFrame.right = boundaries.right + adjust;
          }
          // we're taller than the crop area, maximize width and center vertically:
          else {
            adjust = (boundaries.height - boundaries.width/options.forceAspect)/2;
            newFrame.left = boundaries.left;
            newFrame.right = boundaries.right;
            newFrame.top = boundaries.top + adjust;
            newFrame.bottom = boundaries.bottom + adjust;
          }

          moveFrame(null, newFrame);
        }
        else {
          moveFrame(null, boundaries);
        }
      }

      var style = cropFrame[0].style;
      var theWidth = elWidth+'px';
      var theHeight = elHeight+'px';
      style.borderTopWidth = theHeight;
      style.borderBottomWidth = theHeight;
      style.borderLeftWidth = theWidth;
      style.borderRightWidth = theWidth;

      maybeCallOnFrameChanged();
    }

    var frameRequest;

    function browserResized(e) {
      // Throttle resize events to a rate we can handle
      if(frameRequest) {
        window.cancelAnimationFrame(frameRequest);
      }

      frameRequest = window.requestAnimationFrame(handleBoundsChange, $el[0]);
    }

    $(window).resize(browserResized);

    /**
     * Observers to watch for dimension changes from outside
     */
    var containerObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        handleBoundsChange();
      });
    });

    var config = { attributes: true };
    containerObserver.observe($el[0], config);
    if(options.image) {containerObserver.observe($(options.image)[0] || $el[0], config);}

    /**
     * Cropping Frame
     */

    function borderSize(side) {
      var val = cropFrame.css('border-'+side+'-width');
      return +val.substring(0, val.length-2);
    }

    function cropFrameMousedown(e) {
      mouseIsDown = true;
      moveHandler = cropFrameMoved;

      clickOffset = {
        x: e.pageX - cropFrame.offset().left - borderSize('left'),
        y: e.pageY - cropFrame.offset().top - borderSize('top')
      };

      return false;
    }

    cropFrame.mousedown(cropFrameMousedown);

    function cropFrameMoved(e) {
      if(!mouseIsDown) { return; }

      var offset = $el.offset();
      var width = (elWidth - frameRect.right) - frameRect.left;
      var height = (elHeight - frameRect.bottom) - frameRect.top;
      var left = e.pageX - offset.left - clickOffset.x;
      var top = e.pageY - offset.top - clickOffset.y;

      moveFrame(null, {
        top: top,
        left: left,
        bottom: elHeight - top - height,
        right: elWidth - left - width
      }, true);

      return false;
    }

    cropFrame.css({
      'position': 'absolute',
      'top': 0,
      'left': 0,
      'right': 0,
      'bottom': 0
    });

    if(options.circle) {
      cropFrame.css('border-radius', '50%');
    }

    moveFrame('shrink', {
      top: frameRect.top,
      left: frameRect.left,
      bottom: frameRect.bottom,
      right: frameRect.right
    });

    $el.append(cropFrame);

    /**
     * Handles
     */

    var whichHandle = null;

    function moveFrame(aspectAdjust, newRect, opt_explicit) {
      // explicitly moved by user?
      if(opt_explicit) {
        options.noInitialBounds = false;
      }

      oldFrameRect = {
        top: frameRect.top,
        left: frameRect.left,
        bottom: frameRect.bottom,
        right: frameRect.right
      };

      // fix aspect ratio if neccesary
      if (options.forceAspect && aspectAdjust) {
        var newHeight = ((elWidth - newRect.right) - newRect.left) / options.forceAspect;
        var adjustHeight = newHeight - ((elHeight - newRect.bottom) - newRect.top);

        var newWidth = ((elHeight - newRect.bottom) - newRect.top) * options.forceAspect;
        var adjustWidth = newWidth - ((elWidth - newRect.right) - newRect.left);

        if (aspectAdjust == 'shrink') {
          if(adjustWidth > 0) {
            aspectAdjust = 'vertical';
          }
          else {
            aspectAdjust = 'horizontal';
          }
        }

        if (aspectAdjust == 'vertical') {
          newRect.top -= adjustHeight / 2;
          newRect.bottom -= adjustHeight / 2;
        }
        else if (aspectAdjust == 'horizontal') {
          newRect.left -= adjustWidth / 2;
          newRect.right -= adjustWidth / 2;
        }
        else if (aspectAdjust == 'left' || aspectAdjust == 'right') {
          newRect[aspectAdjust] -= adjustWidth;
        }
        else if (aspectAdjust == 'top' || aspectAdjust == 'bottom') {
          newRect[aspectAdjust] -= adjustHeight;
        }
      }

      // don't let size get too big or negative
      var finalWidth = elWidth - newRect.left - newRect.right;
      var finalHeight = elHeight - newRect.top - newRect.bottom;
      
      if(finalWidth < 0 || finalWidth > boundaries.width || finalHeight < 0 || finalHeight > boundaries.height) {
        newRect = oldFrameRect;
      }

      // keep rect inside bounds
      var dx = 0;
      var dy = 0;

      if (newRect.top < boundaries.top) {
        dy = boundaries.top - newRect.top ;
      }

      if (newRect.bottom < boundaries.bottom) {
        dy = newRect.bottom - boundaries.bottom;
      }

      if (newRect.left < boundaries.left) {
        dx = boundaries.left - newRect.left;
      }

      if (newRect.right < boundaries.right) {
        dx = newRect.right - boundaries.right;
      }

      newRect.left += dx;
      newRect.right -= dx;
      newRect.top += dy;
      newRect.bottom -= dy;

      frameRect = newRect;

      // on android, this seems to be marginally faster than doing it the jq way.
      var style = cropFrame[0].style;
      style.top = (frameRect.top - elHeight) + 'px';
      style.bottom = (frameRect.bottom - elHeight) + 'px';
      style.left = (frameRect.left - elWidth) + 'px';
      style.right = (frameRect.right - elWidth) + 'px';
    }

    function resizeMoved(e) {
      if(e && !mouseIsDown) { return; }

      var offset = $el.offset();

      var newX = e.pageX - offset.left - clickOffset.x;
      var newY = e.pageY - offset.top - clickOffset.y;

      var aspectAdjust = null;

      var newRect = {
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
        bottom: frameRect.bottom
      };

      if(whichHandle.data('adjust-left')) {
        newRect.left = newX;
        aspectAdjust = whichHandle.data('adjust-top') ? 'top' : whichHandle.data('adjust-bottom') ? 'bottom' : 'vertical';
      }

      if(whichHandle.data('adjust-right')) {
        newRect.right = elWidth - newX;
        aspectAdjust = whichHandle.data('adjust-top') ? 'top' : whichHandle.data('adjust-bottom') ? 'bottom' : 'vertical';
      }

      if(whichHandle.data('adjust-top')) {
        newRect.top = newY;
        aspectAdjust = whichHandle.data('adjust-left') ? 'left' : whichHandle.data('adjust-right') ? 'right' : 'horizontal';
      }

      if(whichHandle.data('adjust-bottom')) {
        newRect.bottom = elHeight - newY;
        aspectAdjust = whichHandle.data('adjust-left') ? 'left' : whichHandle.data('adjust-right') ? 'right' : 'horizontal';
      }

      moveFrame(aspectAdjust, newRect, true);

      return false;
    }

    function resizeTouchMove(touch1, touch2) {
      var oldDX = Math.abs(resizeLast.x - resizeAnchor.x);
      var oldDY = Math.abs(resizeLast.y - resizeAnchor.y);

      var newDX = Math.abs(touch2.pageX - touch1.pageX);
      var newDY = Math.abs(touch2.pageY - touch1.pageY);

      var widthChange = (newDX-oldDX);
      var heightChange = (newDY-oldDY);

      var oldXCenter = Math.min(resizeAnchor.x, resizeLast.x) + oldDX/2;
      var oldYCenter = Math.min(resizeAnchor.y, resizeLast.y) + oldDY/2;

      var newXCenter = Math.min(touch1.pageX, touch2.pageX) + newDX/2;
      var newYCenter = Math.min(touch1.pageY, touch2.pageY) + newDY/2;

      var moveX = newXCenter - oldXCenter;
      var moveY = newYCenter - oldYCenter;

      moveFrame(Math.abs(widthChange) > Math.abs(heightChange) ? 'vertical' : 'horizontal', {
        left: frameRect.left - (widthChange/2 - moveX),
        right: frameRect.right - (widthChange/2 + moveX),
        top: frameRect.top - (heightChange/2 - moveY),
        bottom: frameRect.bottom - (heightChange/2 + moveY)
      }, true);

      resizeAnchor = { x: touch1.pageX, y: touch1.pageY };
      resizeLast = { x: touch2.pageX, y: touch2.pageY };
    }

    function startResize(e) {
      mouseIsDown = true;
      moveHandler = resizeMoved;
      whichHandle = $(e.currentTarget);

      if (!clickOffset) {
        clickOffset = $(e.target).offset();
        clickOffset = {
          x: e.pageX - clickOffset.left,
          y: e.pageY - clickOffset.top
        };
      }

      return false;
    }

    //defer so widths and heights will exist
    setTimeout(function() {
      if(options.handles) {
        for(var i=0; i<options.handles; i++) {
          handles[i] = $('<div class="crop-circle-handle handle-'+i+'"></div>');
          handles[i].mousedown(startResize);
          handles[i].css('position', 'absolute');

          cropFrame.append(handles[i]);
        }
      }

      handles[0].css('top', 0).css('left', 0).data('adjust-left', true).data('adjust-top', true);
      handles[1].css('top', 0).css('right', 0).data('adjust-right', true).data('adjust-top', true);
      handles[2].css('bottom', 0).css('left', 0).data('adjust-left', true).data('adjust-bottom', true);
      handles[3].css('bottom', 0).css('right', 0).data('adjust-right', true).data('adjust-bottom', true);

      if(options.handles == 8) {
        handles[4].css({ top: 0, left: '50%', 'margin-left': -handles[4].width()/2 + "px" }).data('adjust-top', true);
        handles[5].css({ right: 0, top: '50%', 'margin-top': -handles[5].height()/2 + "px" }).data('adjust-right', true);
        handles[6].css({ bottom: 0, left: '50%', 'margin-left': -handles[6].width()/2 + "px" }).data('adjust-bottom', true);
        handles[7].css({ left: 0, top: '50%', 'margin-top': -handles[7].height()/2 + "px" }).data('adjust-left', true);
      }

      function noSelect(self) {
        this.onselectstart = function() {
          return false;
        };
        self.unselectable = "on";
        $(self).css('-moz-user-select', 'none');
        $(self).css('-webkit-user-select', 'none');
      }

      noSelect(cropFrame[0]);
      noSelect($el[0]);
      cropFrame.each(function() {noSelect(this);});
    }, 10);
  }

  return CropCircle;
});
