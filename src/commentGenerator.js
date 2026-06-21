export function getGenerationCost(students, settings) {
  return students.length;
}

export function generateComment(student, settings, overrideTone) {
  const { stage, scene, length, tone, template } = settings;
  const activeTone = overrideTone || tone;
  const hasStudentTags = Boolean(student.tags?.length);
  const tags = hasStudentTags ? student.tags : ["态度平稳", "能遵守班级要求"];
  const tagA = tags[0];
  const tagB = tags[1] || tagA;
  const tagC = tags[2] || tagB;
  const noteHint = student.note ? `老师还关注到：${student.note}。` : "";
  const templateHint = template.trim() ? "整体表达会参考学校模板的格式和语气。" : "";
  const noTagHint = hasStudentTags ? "" : "由于未选择具体标签，评语会保持稳妥概括，不编造成绩、奖项或具体事件。";

  const openers = {
    正式: `${student.name}同学本学期在${stage}阶段的学习生活中表现稳定，能够遵守学校和班级要求。`,
    温柔: `${student.name}同学这一学期给老师留下了踏实、真诚的印象。`,
    鼓励: `${student.name}同学本学期一直在努力向前，每一点进步都值得被看见。`,
    亲切: `${student.name}同学在班级里认真可爱，和同学相处融洽。`,
    简短: `${student.name}同学本学期表现良好，态度认真。`,
  };

  const middles = {
    "成绩单 / 报告册评语": `你在课堂学习、日常作业和集体活动中都能保持参与，${tagA}的特点比较突出，${tagB}也值得肯定。`,
    家长版: `在校期间，你能积极配合老师的安排，和同学友好相处，${tagA}，也逐渐养成了更好的学习习惯。`,
    简短版: `你${tagA}，${tagB}，若能继续保持主动性，会有更扎实的成长。`,
    鼓励版: `老师欣喜地看到你在${tagA}方面的变化，也相信你能把这份劲头延续到新的学期。`,
    正式版: `总体来看，你学习态度端正，班级适应良好，在${tagA}和${tagB}方面表现较为明显。`,
  };

  const closers = {
    正式: "希望你下学期继续夯实基础，提升学习主动性，在稳定中取得新的进步。",
    温柔: "愿你继续带着这份认真和自信，慢慢积累，稳稳成长。",
    鼓励: "请相信坚持的力量，新的学期继续大胆尝试，老师期待看到更闪亮的你。",
    亲切: "新学期继续加油，把好习惯坚持下去，你一定会越来越棒。",
    简短: "希望你继续努力，取得更大进步。",
  };

  if (length === "50字" || activeTone === "简短") {
    return `${openers[activeTone]}${middles[scene]}${noteHint}${noTagHint}${closers[activeTone]}`;
  }

  if (length === "自定义" && Number(settings.customLength) >= 120) {
    return `${openers[activeTone]}${middles[scene]}你身上${tagA}、${tagB}、${tagC}的表现值得肯定，同时也可以在预习复习、表达思考或作业细致度上给自己提出更高要求。${noteHint}${noTagHint}${templateHint}${closers[activeTone]}`;
  }

  return `${openers[activeTone]}${middles[scene]}如果能在细节上更加专注，把已有的好习惯坚持得更稳定，相信你会收获更明显的成长。${noteHint}${noTagHint}${templateHint}${closers[activeTone]}`;
}
