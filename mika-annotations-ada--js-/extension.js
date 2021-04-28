const vscode = require('vscode');
const fs = require('fs');
const glob = require('glob');
const cp = require('child_process');
const separator = "\\";
const NewMikaFolder = "SecretMikaFolder";
const MikaProcedure = "\nprocedure SecretMikaCall(ID : in Integer; E : in Boolean) is\nbegin\n\tnull;\nend SecretMikaCall;\n";
const MikaComment = "--#MIKA 'enter the conditions you would like to be met here'";
const PackageBody = "package body";
const NewLine = "\n";
const Dot = ".";
const secret_mika_function_call = "SecretMikaCall({args});\n";
const LINES = "----------------------------------------------------------\n";
const TEST_NUMBER_STRING = "TEST NUMBER ";
const CONSTRUCTED_TEST_INPUT = "CONSTRUCTED TEST INPUT \n";
const MIKAHEADER = `----------------------------------------------------------
--              MIKA TEST INPUTS GENERATOR              --
-- 			https://github.com/echancrure/Mika          --
--                http://www.midoan.com/                --\n`;



/**
 * @param {vscode.ExtensionContext} context
 */

function copy_current_dir()  {
	var paths = vscode.window.activeTextEditor.document.fileName.split(separator);
	var name = paths.pop();
	var fullPath = paths.join(separator);
	var mikaFolder = fullPath + separator + NewMikaFolder;
	if(!fs.existsSync(mikaFolder))
	{
		fs.mkdirSync(mikaFolder);
	}
	var dirPaths = fs.readdirSync(fullPath);
	for(let i = 0; i < dirPaths.length; i++)
	{
		if (dirPaths[i].includes(Dot))
		{
			fs.copyFileSync(fullPath + separator + dirPaths[i], mikaFolder + separator + dirPaths[i]);
		}
	}
	return [name, mikaFolder];
}

function get_mika_comment(code) {
	var commentsAndLineNos = [];
	var subProgram;
	for(let i = 0; i < code.length; i++){
		let line = code[i].trim();
		if(line.toLowerCase().startsWith("procedure ") || line.toLowerCase().startsWith("function ")){
			subProgram = line.slice(line.indexOf(' '), line.indexOf('(')).trim();
		}
		if(line.toLowerCase().startsWith("--#mika")) {
			commentsAndLineNos.push([line.slice(line.indexOf(' ')).trim(),i+1]);
			break;
		}
	}
	return [commentsAndLineNos, subProgram];
}

function activate(context) {
	var editor = vscode.window.activeTextEditor;
	let disposable = vscode.commands.registerCommand('mika-annotations-ada--js-.genTestInput', function () {
		var [name, mikaFolder] = copy_current_dir();
		var nameMinusExt = name.substring(0,name.length-4);
		var lines = editor.document.getText().split(NewLine);
		var [mikaComments, subProgram] = get_mika_comment(lines);
		var package_body_line_number = -1;
		for(let i = 0; i<lines.length; i++) {
			if(lines[i].toLowerCase().includes(PackageBody)) {
				package_body_line_number = i + 1;
				break;
			}
		}

		var path = mikaFolder + separator + name;
		var textOfCopy = fs.readFileSync(path).toString().split(NewLine);
		var textOffset = 0;
		const insert_at_position = (arr,pos,element) => {
			if(pos == 0){
				return  [element].concat(arr);
			}
			return arr.slice(0,pos).concat([element]).concat(arr.slice(pos));
		};
		for(let i = 0; i < mikaComments.length; i++){
			let [comment,line_number] = mikaComments[i];
			textOfCopy = insert_at_position(textOfCopy,line_number+(textOffset++),secret_mika_function_call.replace("{args}",`${i+1},${comment}`));
		}
		textOfCopy = insert_at_position(textOfCopy,package_body_line_number,MikaProcedure);
		textOfCopy = textOfCopy.join('\n');
		fs.writeFileSync(path,textOfCopy);
		var config = vscode.workspace.getConfiguration("mika-annotations-ada--js-");
		var mp = config.mikaPath;
		var gp = config.gnatPath;
		if(fs.existsSync(mp) && fs.existsSync(gp)) {
			let commands = [
				`cd ${mikaFolder}`,
				`${mp}${separator}mika_ada_parser.exe -M"${mp}" -f"${gp}" -gnat05 -d ${nameMinusExt}`,
				`cd ${mikaFolder}${separator}${nameMinusExt}_mika`,
				`${mp}${separator}mika_ada_generator.exe -M"${mp}" -S${subProgram} -Tquery -Cignored -d ${nameMinusExt}`
			];
			cp.spawnSync(commands.join(' & '),{shell:true});
			try{
				var jsonFile = glob.sync(`${mikaFolder}${separator}${nameMinusExt}_mika${separator}${subProgram.toLowerCase()}_*${separator}${nameMinusExt}.json`)[0];
				if (jsonFile === undefined)
					throw "Error";
			}
			catch(e) {
				vscode.window.showErrorMessage("Mika failed to generate test inputs");
				fs.rmdirSync(mikaFolder, {recursive:true});
				return;
			}
			var text = fs.readFileSync(jsonFile);
			var json = JSON.parse(text);
			vscode.workspace.openTextDocument().then((a) => {
				vscode.window.showTextDocument(a,{viewColumn:vscode.ViewColumn.Beside}).then(e => {
					e.edit(edit => {
						let outer_keys = Object.keys(json);
						let offset = 6;
						if (outer_keys.length === 0)
						{
							edit.insert(new vscode.Position(0, 0), MIKAHEADER);
							edit.insert(new vscode.Position((offset++), 0), LINES);
							edit.insert(new vscode.Position((offset++), 0), "NO CONSTRUCTED TEST INPUT FOUND\n");
							edit.insert(new vscode.Position((offset++), 0), LINES);
							edit.insert(new vscode.Position((offset++), 0),"\n");
							return;
						}
						edit.insert(new vscode.Position(0, 0), MIKAHEADER);
						for(let i=0;i<outer_keys.length;i++)
						{
							edit.insert(new vscode.Position(i+(offset++), 0), LINES);
							let test_string_with_number = TEST_NUMBER_STRING + (i+1) + "\n";
							edit.insert(new vscode.Position(i+(offset++), 0), test_string_with_number);
							edit.insert(new vscode.Position(i+(offset++), 0), CONSTRUCTED_TEST_INPUT);
							Object.keys(json[outer_keys[i]]).forEach(function(key){
								edit.insert(new vscode.Position(i+(offset++), 0),`${key} = ${json[outer_keys[i]][key]}\n`);
							});
							edit.insert(new vscode.Position(i+(offset++), 0), LINES);
							edit.insert(new vscode.Position(i+(offset++), 0),"\n");
						}
						})
					});
				}, (error) => {
					console.error(error);
					return;
				});
			fs.rmdirSync(mikaFolder, {recursive:true});
		} 
		else {
			vscode.window.showErrorMessage("Mika or GNAT paths are invalid.");
		}
		
	});
	let disposable2 = vscode.commands.registerCommand('mika-annotations-ada--js-.adaannotations', function () {
		var editor = vscode.window.activeTextEditor;
		editor.insertSnippet( new vscode.SnippetString(MikaComment, editor.selection.active));
	});
	context.subscriptions.push(disposable);
	context.subscriptions.push(disposable2);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}



