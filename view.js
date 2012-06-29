/******************************************************************************
* view.js                                                                     *
* Copyright 2012                                                              *
* For details about the copyright holders, see the COPYRIGHT file.            *
* This software is freely distributed under the ISC License.                  *
* For details about the license, see the LICENSE file.                        *
******************************************************************************/
(function() {
    var comments_div,
    highlight_start = -1,
    highlight_end = -1,
    selection_start = -1,
    selection_end = -1,
    comment_ob = null,
    comment_box_ob = null,
    num_lines = -1,
    comments = {},
    language_data = null,
    codeMirror = null,
    noSelect = false;

/******************************************************************************
* Utility Functions                                                           *
******************************************************************************/

    function modulo(n,m) {
	while(n < 0)
	    n += m;
	return n%m;
    }

    function logError(text) {
	console.log('ERROR: ' + text);
    }

    function reportError(text) {
	logError(text);
	$('#error').text(text).show();
    }

    function handleAjaxError(jqXHR, textStatus, errorThrown) {
	reportError(errorThrown);
    }

    function include(filename) {
	console.log('including ' + filename);
	if(filename.indexOf('.js') != -1) {
	    $('<script>').attr('src',filename).appendTo($('head'));
	} else if(filename.indexOf('.css') != -1) {
	    $('<link>')
		.attr('rel','stylesheet')
		.attr('href',filename)
		.appendTo($('head'));
	} else {
	    logError('failed to include file: '+filename);
	}
    }

    function resolveRequirements(languages,language,requirements,req_list){
	var lang = languages[language];
	var requires = lang.requires;
	if(requires){
	    for(var requirement in requires){
		var name = requires[requirement];
		if(!requirements[name]){
		    requirements[name] = true;
		    resolveRequirements(languages,name,requirements,req_list);
		    req_list.push(name);
		}
	    }
	}
    }

/******************************************************************************
* Data retrieval                                                              *
******************************************************************************/

    function getCode(id,success_fn,error_fn) {
	$.ajax('do/code',{
	    data:     {id:id},
	    dataType: 'json',
	    error:    error_fn,
	    success:  success_fn
	});
    }

    function getComments(id,success_fn,error_fn) {
	$.ajax('do/comments',{
	    data:     {code_id:id},
	    dataType: 'json',
	    error:    error_fn,
	    success:  success_fn
	});
    }

    function getLanguage(id,success_fn,error_fn) {
	$.ajax('do/language',{
	    data:     {id:id},
	    dataType: 'json',
	    error:    error_fn,
	    success:  success_fn
	});
    }

    function getLanguageData(success_fn,error_fn) {
	$.ajax('languages.json',{
	    dataType: 'json',
	    error:    error_fn,
	    success:  success_fn
	});
    }
    
/******************************************************************************
* Highlighting                                                                *
******************************************************************************/

    function getSelection(codeMirror){
	if(!noSelect){
	    if(codeMirror.somethingSelected){
		var start = codeMirror.getCursor(true).line + 1;
		var end = codeMirror.getCursor(false).line + 1;
		showCommentBox(start,end);
	    }else{
		hideCommentBox();
	    }
	}
    }

    function setSelection(event){
	var startLine = event.data.startLine-1;
	var endLine = event.data.endLine;
	noSelect = true;
	codeMirror.setSelection({line:startLine,ch:0},{line:endLine,ch:0});
	noSelect = false;
    }

/******************************************************************************
* Comment Input                                                               *
******************************************************************************/

    function showCommentBox(start,end) {
	hideComments();
	selection_start = start;
	selection_end = end;
	$('input#line_start').val(start);
	$('input#line_end').val(end);
	$('#lineStartNum').text(start);
	$('#lineEndNum').text(end);
	var comment_box = $('#comment_box');
	comment_box.slideDown();
    }

    function closeCommentBox() {
	$('#comment_box').hide();
	selection_start = -1;
	selection_end = -1;
    }
    
/******************************************************************************
* Comment Display                                                             *
******************************************************************************/

    function writeComments(comments_ob) {
	if((typeof comments_ob) === "string"){
    	    comments_ob = jQuery.parseJSON(comments_ob);
	}
	buildCommentStructure(comments_ob);
    }

    function buildCommentStructure(comments_ob) {
	var comments_list = comments_ob.comments;
	for(var index in comments_list) {
	    var comment = comments_list[index];
	    var line_start = comment.line_start;
	    if(comments[line_start] === undefined)
		comments[line_start] = [];
	    comments[line_start].push(comment);
	}
	for(var i in comments){
	    buildCommentSet(Number(i)-1,comments[i]);
	}
    }

    function buildCommentSet(lineNumber,commentSet) {
	if(codeMirror == null) {
	    logError('Tried to build comment set while code mirror null');
	    return;
	}
	codeMirror.setMarker(lineNumber,
			     "<span class='commentNumber'>("+
			     commentSet.length+")</span> %N%");
	var set = $("<div class='commentSet'>");
	set.attr("lineNumber",lineNumber);
	for(var i=0;i<commentSet.length;i++){
	    var comment = commentSet[i];
	    var commentDiv = $("<div class='commentBox'>");
	    commentDiv.mouseover({startLine:comment.line_start,endLine:comment.line_end},setSelection);
	    var title = $("<div class='commentTitle'>");
	    title.text(comment.user);
	    var body = $("<div class='commentBody'>");
	    body.text(comment.text);
	    commentDiv.append(title);
	    commentDiv.append(body);
	    set.append(commentDiv);
	}
	
	$("#commentsDiv").append(set);
	set.hide();
    }

    function showComments(codeMirror, lineNumber){
	closeCommentBox();
	hideComments();
	$(".commentSet[lineNumber='"+lineNumber+"']").slideDown();
    }

    function hideComments(){
	$(".commentSet").hide();
    }
    
/******************************************************************************
* Code Display                                                                *
******************************************************************************/
    
    function writeCodeLines(code) {
	if(code === null) return;
	if((typeof code) === "string"){
	    code = jQuery.parseJSON(code);
	}
	$('#code_id').val(code.id);
	var lines = code.text.split('\n');
	num_lines = lines.length;
	$("#code").text(code.text);
	if(!codeMirror){
	    getLanguage(code.language_id,function(language_ob) {
		var language = language_data.data[language_ob.mode];
		var req_ob = {};
		var requirements = [];
		resolveRequirements(language_data.data,
				    language_ob.mode,
				    req_ob,
				    requirements);
		if(req_ob[language_ob.mode] === undefined)
		    requirements.push(language_ob.mode);
		for(var index in requirements) {
		    var lang = requirements[index];
		    var file = language_data.data[lang].file;
		    if(file !== undefined) {
			include(language_data.include_path+file);
		    }
		}
		var options = {
		    lineNumbers: true,
		    lineWrapping: true,
		    fixedGutter: true,
		    readOnly: true,
		    onGutterClick: showComments,
		    onCursorActivity: getSelection,
		    mode: language.mode
		};
		console.log(options.mode);
		for(var index in language.options) {
		    options[index] = language.options[index];
		}
		codeMirror = CodeMirror.fromTextArea(
		    document.getElementById("code"),options);
		getComments(code.id,writeComments,handleAjaxError);
	    },handleAjaxError);
	}else{
	    comments = [];
	    $(".commentSet").remove();
	}
    }
    
/******************************************************************************
* Run when display ready                                                      *
******************************************************************************/

    $(document).ready(function() {
	$('#comment_box').hide();
	$('#error').hide();
	// retrieve and display code
	var query = URI(document.URL).query(true);
	if(query.error != undefined) {
	    reportError(query.error);
	}
	if(query.id === undefined) {
	    reportError("Code ID not found");
	    return;
	}
	$('#comment_form').ajaxForm(function(){
	    getCode(query.id,writeCodeLines,handleAjaxError);
	    closeCommentBox();
	});
	getLanguageData(function(language_ob) {
	    language_data = language_ob;
	    getCode(query.id,writeCodeLines,handleAjaxError);
	},handleAjaxError);
    });
})();
