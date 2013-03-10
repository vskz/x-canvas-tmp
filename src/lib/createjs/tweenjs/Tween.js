xc.module.define("xc.createjs.Tween", function(exports) {

    // TODO: possibly add a END actionsMode (only runs actions that == position)?
    // TODO: evaluate a way to decouple paused from tick registration.

    var Ticker = xc.module.require("xc.createjs.Ticker");
    var EventDispatcher = xc.module.require("xc.createjs.EventDispatcher");

    /**
     * A Tween instance tweens properties for a single target.
     * Instance methods can be chained for easy construction and sequencing:
     *
     * <h4>Example</h4>
     *
     *     target.alpha = 1;
     *     Tween.get(target)
     *         .wait(500)
     *         .to({alpha:0, visible:false}, 1000)
     *         .call(onComplete);
     *     function onComplete() {
   *         //Tween complete
   *     }
     *
     * Multiple tweens can point to the same instance, however if they affect the same properties there could be unexpected
     * behaviour. To stop all tweens on an object, use {{#crossLink "Tween/removeTweens"}}{{/crossLink}} or pass <code>override:true</code>
     * in the props argument.
     *
     *     Tween.get(target, {override:true}).to({x:100});
     *
     * Subscribe to the "change" event to get notified when a property of the target is changed.
     *
     *     Tween.get(target, {override:true}).to({x:100}).addEventListener("change", handleChange);
     *     function handleChange(event) {
   *         // The tween changed.
   *     }
     *
     * See the Tween {{#crossLink "Tween/get"}}{{/crossLink}} method for additional param documentation.
     *
     * @class Tween
     * @extends EventDispatcher
     * @constructor
     * @param {Object} target
     * @param {Object} props
     * @param {Object} pluginData
     */
    var Tween = EventDispatcher.extend({
        _init: function(target, props, pluginData) {
            this.target = this._target = target;
            if (props) {
                this._useTicks = props.useTicks;
                this.ignoreGlobalPause = props.ignoreGlobalPause;
                this.loop = props.loop;
                this.onChange = props.onChange;
                if (props.override) { Tween.removeTweens(target); }
            }
            this.pluginData = pluginData || {};
            this._curQueueProps = {};
            this._initQueueProps = {};
            this._steps = [];
            this._actions = [];
            if (props && props.paused) { this._paused = true; }
            else { Tween._register(this, true); }
            if (props && props.position != null) { this.setPosition(props.position, Tween.NONE); }
        },

        /**
         * Causes this tween to continue playing when a global pause is active. For example, if TweenJS is using Ticker,
         * then setting this to true (the default) will cause this tween to be paused when <code>Ticker.setPaused(true)</code> is called.
         * See Tween.tick() for more info. Can be set via the props param.
         *
         * @property ignoreGlobalPause
         * @type Boolean
         * @default false
         */
        ignoreGlobalPause: false,

        /**
         * If true, the tween will loop when it reaches the end. Can be set via the props param.
         *
         * @property loop
         * @type {Boolean}
         * @default false
         */
        loop: false,

        /**
         * Read-only. Specifies the total duration of this tween in milliseconds (or ticks if useTicks is true).
         * This value is automatically updated as you modify the tween. Changing it directly could result in unexpected behaviour.
         *
         * @property duration
         * @type {Number}
         * @default 0
         */
        duration: 0,

        /**
         * Allows you to specify data that will be used by installed plugins. Each plugin uses this differently, but in general
         * you specify data by setting it to a property of pluginData with the same name as the plugin class.
         *
         * <h4>Example</h4>
         *     myTween.pluginData.PluginClassName = data;
         *
         * Also, most plugins support a property to enable or disable them. This is typically the plugin class name followed by "_enabled".<br/>
         *
         * <h4>Example</h4>
         *     myTween.pluginData.PluginClassName_enabled = false;<br/>
         *
         * Some plugins also store instance data in this object, usually in a property named _PluginClassName.
         * See the documentation for individual plugins for more details.
         * @property pluginData
         * @type {Object}
         */
        pluginData: null,

        /**
         * Called whenever the tween's position changes with a single parameter referencing this tween instance.
         *
         * @property onChange
         * @type {Function}
         */
        onChange: null,

        /**
         * Called whenever the tween's position changes with a single parameter referencing this tween instance.
         * @event change
         */
        change: null,

        /**
         * Read-only. The target of this tween. This is the object on which the tweened properties will be changed. Changing
         * this property after the tween is created will not have any effect.
         *
         * @property target
         * @type {Object}
         */
        target: null,

        /**
         * Read-only. The current normalized position of the tween. This will always be a value between 0 and duration.
         * Changing this property directly will have no effect.
         *
         * @property position
         * @type {Object}
         */
        position: null,

        /**
         * @property _paused
         * @type {Boolean}
         * @default false
         * @protected
         */
        _paused: false,

        /**
         * @property _curQueueProps
         * @type {Object}
         * @protected
         */
        _curQueueProps: null,

        /**
         * @property _initQueueProps
         * @type {Object}
         * @protected
         */
        _initQueueProps: null,

        /**
         * @property _steps
         * @type {Array}
         * @protected
         */
        _steps: null,

        /**
         * @property _actions
         * @type {Array}
         * @protected
         */
        _actions: null,

        /**
         * Raw position.
         *
         * @property _prevPosition
         * @type {Number}
         * @default 0
         * @protected
         */
        _prevPosition: 0,

        /**
         * The position within the current step.
         *
         * @property _stepPosition
         * @type {Number}
         * @default 0
         * @protected
         */
        _stepPosition: 0, // this is needed by MovieClip.

        /**
         * Normalized position.
         *
         * @property _prevPos
         * @type {Number}
         * @default -1
         * @protected
         */
        _prevPos: -1,

        /**
         * @property _target
         * @type {Object}
         * @protected
         */
        _target: null,

        /**
         * @property _useTicks
         * @type {Boolean}
         * @default false
         * @protected
         */
        _useTicks: false,

        /**
         * Queues a wait (essentially an empty tween).
         *
         * <h4>Example</h4>
         *     //This tween will wait 1s before alpha is faded to 0.
         *     Tween.get(target).wait(1000).to({alpha:0}, 1000);
         *
         * @method wait
         * @param {Number} duration The duration of the wait in milliseconds (or in ticks if <code>useTicks</code> is true).
         * @return {Tween} This tween instance (for chaining calls).
         */
        wait: function(duration) {
            if (duration == null || duration <= 0) { return this; }
            var o = this._cloneProps(this._curQueueProps);
            return this._addStep({d: duration, p0: o, e: this._linearEase, p1: o});
        },

        /**
         * Queues a tween from the current values to the target properties. Set duration to 0 to jump to these value.
         * Numeric properties will be tweened from their current value in the tween to the target value. Non-numeric
         * properties will be set at the end of the specified duration.
         *
         * <h4>Example</h4>
         *       Tween.get(target).to({alpha:0}, 1000);
         *
         * @method to
         * @param {Object} props An object specifying property target values for this tween (Ex. <code>{x:300}</code> would tween the x
         *  property of the target to 300).
         * @param {Number} duration Optional. The duration of the wait in milliseconds (or in ticks if <code>useTicks</code> is true).
         *  Defaults to 0.
         * @param {Function} ease Optional. The easing function to use for this tween. Defaults to a linear ease.
         * @return {Tween} This tween instance (for chaining calls).
         */
        to: function(props, duration, ease) {
            if (isNaN(duration) || duration < 0) { duration = 0; }
            return this._addStep({d: duration ||
                    0, p0: this._cloneProps(this._curQueueProps), e: ease, p1: this._cloneProps(this._appendQueueProps(props))});
        },

        /**
         * Queues an action to call the specified function.
         *
         * <h4>Example</h4>
         *     // would call myFunction() after 1s.
         *     myTween.wait(1000).call(myFunction);
         *
         * @method call
         * @param {Function} callback The function to call.
         * @param {Array} params Optional. The parameters to call the function with. If this is omitted, then the function
         *  will be called with a single param pointing to this tween.
         * @param {Object} scope Optional. The scope to call the function in. If omitted, it will be called in the target's scope.
         * @return {Tween} This tween instance (for chaining calls).
         */
        call: function(callback, params, scope) {
            return this._addAction({f: callback, p: params ? params : [this], o: scope ? scope : this._target});
        },

        // TODO: add clarification between this and a 0 duration .to:
        /**
         * Queues an action to set the specified props on the specified target. If target is null, it will use this tween's
         * target.
         *
         * <h4>Example</h4>
         *     myTween.wait(1000).set({visible:false},foo);
         *
         * @method set
         * @param {Object} props The properties to set (ex. <code>{visible:false}</code>).
         * @param {Object} target Optional. The target to set the properties on. If omitted, they will be set on the tween's target.
         * @return {Tween} This tween instance (for chaining calls).
         */
        set: function(props, target) {
            return this._addAction({f: this._set, o: this, p: [props, target ? target : this._target]});
        },

        /**
         * Queues an action to to play (unpause) the specified tween. This enables you to sequence multiple tweens.
         *
         * <h4>Example</h4>
         *     myTween.to({x:100},500).play(otherTween);
         *
         * @method play
         * @param {Tween} tween The tween to play.
         * @return {Tween} This tween instance (for chaining calls).
         */
        play: function(tween) {
            return this.call(tween.setPaused, [false], tween);
        },

        /**
         * Queues an action to to pause the specified tween.
         *
         * @method pause
         * @param {Tween} tween The tween to play. If null, it pauses this tween.
         * @return {Tween} This tween instance (for chaining calls)
         */
        pause: function(tween) {
            if (!tween) { tween = this; }
            return this.call(tween.setPaused, [true], tween);
        },

        /**
         * Advances the tween to a specified position.
         *
         * @method setPosition
         * @param {Number} value The position to seek to in milliseconds (or ticks if useTicks is true).
         * @param {Number} actionsMode Optional parameter specifying how actions are handled (ie. call, set, play, pause):
         *  <code>Tween.NONE</code> (0) - run no actions. <code>Tween.LOOP</code> (1) - if new position is less than old, then run all actions
         *  between old and duration, then all actions between 0 and new. Defaults to <code>LOOP</code>. <code>Tween.REVERSE</code> (2) - if new
         *  position is less than old, run all actions between them in reverse.
         * @return {Boolean} Returns true if the tween is complete (ie. the full tween has run & loop is false).
         */
        setPosition: function(value, actionsMode) {
            if (value < 0) { value = 0; }
            if (actionsMode == null) { actionsMode = 1; }
            // normalize position:
            var t = value;
            var end = false;
            if (t >= this.duration) {
                if (this.loop) { t = t % this.duration; }
                else {
                    t = this.duration;
                    end = true;
                }
            }
            if (t == this._prevPos) { return end; }
            var prevPos = this._prevPos;
            this.position = this._prevPos = t; // set this in advance in case an action modifies position.
            this._prevPosition = value;
            // handle tweens:
            if (this._target) {
                if (end) {
                    // addresses problems with an ending zero length step.
                    this._updateTargetProps(null, 1);
                } else if (this._steps.length > 0) {
                    // find our new tween index:
                    for (var i = 0, l = this._steps.length; i < l; i++) {
                        if (this._steps[i].t > t) { break; }
                    }
                    var step = this._steps[i - 1];
                    this._updateTargetProps(step, (this._stepPosition = t - step.t) / step.d);
                }
            }
            // run actions:
            if (actionsMode != 0 && this._actions.length > 0) {
                if (this._useTicks) {
                    // only run the actions we landed on.
                    this._runActions(t, t);
                } else if (actionsMode == 1 && t < prevPos) {
                    if (prevPos != this.duration) { this._runActions(prevPos, this.duration); }
                    this._runActions(0, t, true);
                } else {
                    this._runActions(prevPos, t);
                }
            }
            if (end) { this.setPaused(true); }
            this.onChange && this.onChange(this);
            this.dispatchEvent("change");
            return end;
        },

        /**
         * Advances this tween by the specified amount of time in milliseconds (or ticks if <code>useTicks</code> is true).
         * This is normally called automatically by the Tween engine (via <code>Tween.tick</code>), but is exposed for advanced uses.
         *
         * @method tick
         * @param {Number} delta The time to advance in milliseconds (or ticks if <code>useTicks</code> is true).
         */
        tick: function(delta) {
            if (this._paused) { return; }
            this.setPosition(this._prevPosition + delta);
        },

        /**
         * Pauses or plays this tween.
         *
         * @method setPaused
         * @param {Boolean} value Indicates whether the tween should be paused (true) or played (false).
         * @return {Tween} This tween instance (for chaining calls)
         */
        setPaused: function(value) {
            this._paused = !!value;
            Tween._register(this, !value);
            return this;
        },

        /**
         * Returns a string representation of this object.
         *
         * @method toString
         * @return {String} a string representation of the instance.
         */
        toString: function() {
            return "[Tween]";
        },

        /**
         * @method clone
         * @protected
         */
        clone: function() {
            throw("Tween can not be cloned.")
        },

        /**
         * @method _updateTargetProps
         * @param {Object} step
         * @param {Number} ratio
         * @protected
         */
        _updateTargetProps: function(step, ratio) {
            var p0, p1, v, v0, v1, arr;
            if (!step && ratio == 1) {
                p0 = p1 = this._curQueueProps;
            } else {
                // apply ease to ratio.
                if (step.e) { ratio = step.e(ratio, 0, 1, 1); }
                p0 = step.p0;
                p1 = step.p1;
            }
            for (n in this._initQueueProps) {
                if ((v0 = p0[n]) == null) { p0[n] = v0 = this._initQueueProps[n]; }
                if ((v1 = p1[n]) == null) { p1[n] = v1 = v0; }
                if (v0 == v1 || ratio == 0 || ratio == 1 || (typeof(v0) != "number")) {
                    // no interpolation - either at start, end, values don't change, or the value is non-numeric.
                    v = ratio == 1 ? v1 : v0;
                } else {
                    v = v0 + (v1 - v0) * ratio;
                }
                var ignore = false;
                if (arr = Tween._plugins[n]) {
                    for (var i = 0, l = arr.length; i < l; i++) {
                        var v2 = arr[i].tween(this, n, v, p0, p1, ratio, !!step && p0 == p1, !step);
                        if (v2 == Tween.IGNORE) { ignore = true; }
                        else { v = v2; }
                    }
                }
                if (!ignore) { this._target[n] = v; }
            }
        },

        /**
         * @method _runActions
         * @param {Number} startPos
         * @param {Number} endPos
         * @param {Boolean} includeStart
         * @protected
         */
        _runActions: function(startPos, endPos, includeStart) {
            var sPos = startPos;
            var ePos = endPos;
            var i = -1;
            var j = this._actions.length;
            var k = 1;
            if (startPos > endPos) {
                // running backwards, flip everything:
                sPos = endPos;
                ePos = startPos;
                i = j;
                j = k = -1;
            }
            while ((i += k) != j) {
                var action = this._actions[i];
                var pos = action.t;
                if (pos == ePos || (pos > sPos && pos < ePos) || (includeStart && pos == startPos)) {
                    action.f.apply(action.o, action.p);
                }
            }
        },

        /**
         * @method _appendQueueProps
         * @param {Object} o
         * @protected
         */
        _appendQueueProps: function(o) {
            var arr, oldValue, i, l, injectProps;
            for (var n in o) {
                if (this._initQueueProps[n] === undefined) {
                    oldValue = this._target[n];
                    // init plugins:
                    if (arr = Tween._plugins[n]) {
                        for (i = 0, l = arr.length; i < l; i++) {
                            oldValue = arr[i].init(this, n, oldValue);
                        }
                    }
                    this._initQueueProps[n] = oldValue === undefined ? null : oldValue;
                } else {
                    oldValue = this._curQueueProps[n];
                }
                if (arr = Tween._plugins[n]) {
                    injectProps = injectProps || {};
                    for (i = 0, l = arr.length; i < l; i++) {
                        // TODO: remove the check for .step in the next version. It's here for backwards compatibility.
                        if (arr[i].step) { arr[i].step(this, n, oldValue, o[n], injectProps); }
                    }
                }
                this._curQueueProps[n] = o[n];
            }
            if (injectProps) { this._appendQueueProps(injectProps); }
            return this._curQueueProps;
        },

        /**
         * @method _cloneProps
         * @param {Object} props
         * @protected
         */
        _cloneProps: function(props) {
            var o = {};
            for (var n in props) {
                o[n] = props[n];
            }
            return o;
        },

        /**
         * @method _addStep
         * @param {Object} o
         * @protected
         */
        _addStep: function(o) {
            if (o.d > 0) {
                this._steps.push(o);
                o.t = this.duration;
                this.duration += o.d;
            }
            return this;
        },

        /**
         * @method _addAction
         * @param {Object} o
         * @protected
         */
        _addAction: function(o) {
            o.t = this.duration;
            this._actions.push(o);
            return this;
        },

        /**
         * @method _set
         * @param {Object} props
         * @param {Object} o
         * @protected
         */
        _set: function(props, o) {
            for (var n in props) {
                o[n] = props[n];
            }
        }
    });

    /**
     * Constant defining the none actionsMode for use with setPosition.
     *
     * @property NONE
     * @type Number
     * @default 0
     * @static
     */
    Tween.NONE = 0;

    /**
     * Constant defining the loop actionsMode for use with setPosition.
     *
     * @property LOOP
     * @type Number
     * @default 1
     * @static
     */
    Tween.LOOP = 1;

    /**
     * Constant defining the reverse actionsMode for use with setPosition.
     *
     * @property REVERSE
     * @type Number
     * @default 2
     * @static
     */
    Tween.REVERSE = 2;

    /**
     * Constant returned by plugins to tell the tween not to use default assignment.
     * @property IGNORE
     * @type Object
     * @static
     */
    Tween.IGNORE = {};

    /**
     * @property _listeners
     * @type Array[Tween]
     * @static
     * @protected
     */
    Tween._tweens = [];

    /**
     * @property _plugins
     * @type Object
     * @static
     * @protected
     */
    Tween._plugins = {};

    /**
     * Returns a new tween instance. This is functionally identical to using "new Tween(...)", but looks cleaner
     * with the chained syntax of TweenJS.
     *
     * <h4>Example</h4>
     *     var tween = Tween.get(target);
     *
     * @method get
     * @static
     * @param {Object} target The target object that will have its properties tweened.
     * @param {Object} props The configuration properties to apply to this tween instance (ex. <code>{loop:true, paused:true}</code>).
     *  All properties default to false. Supported props are:
     *  <ul>
     *    <li>loop: sets the loop property on this tween.</li>
     *    <li>useTicks: uses ticks for all durations instead of milliseconds.</li>
     *    <li>ignoreGlobalPause: sets the ignoreGlobalPause property on this tween.</li>
     *    <li>override: if true, Tween.removeTweens(target) will be called to remove any other tweens with the same target.
     *    <li>paused: indicates whether to start the tween paused.</li>
     *    <li>position: indicates the initial position for this tween.</li>
     *    <li>onChange: specifies an onChange handler for this tween. Note that this is deprecated in favour of the "change" event.</li>
     *  </ul>
     * @param {Object} [pluginData] An object containing data for use by installed plugins. See individual
     *  plugins' documentation for details.
     * @param {Boolean} [override=false] If true, any previous tweens on the same target will be removed. This is the same as
     *  calling <code>Tween.removeTweens(target)</code>.
     * @return {Tween} A reference to the created tween. Additional chained tweens, method calls, or callbacks can be
     *  applied to the returned tween instance.
     */
    Tween.get = function(target, props, pluginData, override) {
        if (override) { Tween.removeTweens(target); }
        return new Tween(target, props, pluginData);
    };

    /**
     * Advances all tweens. This typically uses the Ticker class (available in the EaselJS library), but you can call it
     * manually if you prefer to use your own "heartbeat" implementation.
     *
     * @method tick
     * @static
     * @param {Number} delta The change in time in milliseconds since the last tick. Required unless all tweens have
     *  <code>useTicks</code> set to true.
     * @param {Boolean} paused Indicates whether a global pause is in effect. Tweens with <code>ignoreGlobalPause</code> will ignore
     *  this, but all others will pause if this is true.
     */
    Tween.tick = function(delta, paused) {
        var tweens = Tween._tweens.slice(); // to avoid race conditions.
        for (var i = tweens.length - 1; i >= 0; i--) {
            var tween = tweens[i];
            if ((paused && !tween.ignoreGlobalPause) || tween._paused) { continue; }
            tween.tick(tween._useTicks ? 1 : delta);
        }
    };

    /**
     * Removes all existing tweens for a target. This is called automatically by new tweens if the <code>override</code> prop is true.
     *
     * @method removeTweens
     * @static
     * @param {Object} target The target object to remove existing tweens from.
     */
    Tween.removeTweens = function(target) {
        if (!target.tweenjs_count) { return; }
        var tweens = Tween._tweens;
        for (var i = tweens.length - 1; i >= 0; i--) {
            if (tweens[i]._target == target) {
                tweens[i]._paused = true;
                tweens.splice(i, 1);
            }
        }
        target.tweenjs_count = 0;
    };

    /**
     * Indicates whether there are any active tweens on the target object (if specified) or in general.
     *
     * @method hasActiveTweens
     * @static
     * @param {Object} target Optional. If not specified, the return value will indicate if there are any active tweens
     *  on any target.
     * @return {Boolean} A boolean indicating whether there are any active tweens.
     */
    Tween.hasActiveTweens = function(target) {
        if (target) { return target.tweenjs_count; }
        return Tween._tweens && Tween._tweens.length;
    };

    /**
     * Installs a plugin, which can modify how certain properties are handled when tweened. See the CSSPlugin for an
     * example of how to write TweenJS plugins.
     *
     * @method installPlugin
     * @static
     * @param {Object} plugin The plugin class to install
     * @param {Array} properties An array of properties that the plugin will handle.
     */
    Tween.installPlugin = function(plugin, properties) {
        var priority = plugin.priority;
        if (priority == null) { plugin.priority = priority = 0; }
        for (var i = 0, l = properties.length, p = Tween._plugins; i < l; i++) {
            var n = properties[i];
            if (!p[n]) { p[n] = [plugin]; }
            else {
                var arr = p[n];
                for (var j = 0, jl = arr.length; j < jl; j++) {
                    if (priority < arr[j].priority) { break; }
                }
                p[n].splice(j, 0, plugin);
            }
        }
    };

    /**
     * Registers or unregisters a tween with the ticking system.
     *
     * @method _register
     * @static
     * @protected
     */
    Tween._register = function(tween, value) {
        var target = tween._target;
        if (value) {
            // TODO: this approach might fail if a dev is using sealed objects in ES5
            if (target) { target.tweenjs_count = target.tweenjs_count ? target.tweenjs_count + 1 : 1; }
            Tween._tweens.push(tween);
        } else {
            if (target) { target.tweenjs_count--; }
            var i = Tween._tweens.indexOf(tween);
            if (i != -1) { Tween._tweens.splice(i, 1); }
        }
    };

    Ticker.addListener(Tween, false);

    return Tween;

});
