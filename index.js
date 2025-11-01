
// ================================================================================
// 📚 نظام طلبات الشرح (Explanation Requests) - نسخة كاملة ومحسّنة
// ================================================================================

const explanationRequests = new Map();

// دالة للتحقق من الرابط
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// دالة لإرسال اللوقات
async function sendExplanationLog(title, description, color, fields = []) {
  if (!logWebhook) {
    console.log(`📋 [Explanation Log] ${title}: ${description}`);
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
  
  if (fields.length > 0) embed.addFields(fields);
  
  try {
    await logWebhook.send({ embeds: [embed] });
  } catch (e) {
    console.error("❌ فشل إرسال لوق الشرح:", e);
  }
}

// دالة لاستخراج المرفقات من المحتوى
function extractAttachments(content) {
  const attachments = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = content.match(urlRegex);
  
  if (matches) {
    matches.forEach(url => {
      if (isValidUrl(url)) {
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          attachments.push({ type: 'image', url });
        } else if (url.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i)) {
          attachments.push({ type: 'video', url });
        } else if (url.match(/\.(mp3|wav|ogg|flac)$/i)) {
          attachments.push({ type: 'audio', url });
        } else if (url.match(/\.(pdf|doc|docx|txt)$/i)) {
          attachments.push({ type: 'document', url });
        } else {
          attachments.push({ type: 'link', url });
        }
      }
    });
  }
  
  return attachments;
}

// دالة لإنشاء روم شرح جديد
async function createExplanationRoom(interaction, categoryId, roomName, messageContent, originalRequester) {
  try {
    const guild = interaction.guild;
    const category = guild.channels.cache.get(categoryId);
    
    if (!category) {
      throw new Error('الكاتجوري غير موجود');
    }

    const explanationRoleId = process.env.EXPLANATION_ROLE_ID;
    let permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: originalRequester.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      }
    ];

    if (explanationRoleId) {
      permissionOverwrites.push({
        id: explanationRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const textChannel = await guild.channels.create({
      name: roomName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: permissionOverwrites,
      topic: `روم شرح مقدم من: ${originalRequester.tag} | ${new Date().toLocaleDateString('ar-SA')}`
    });

    const attachments = extractAttachments(messageContent);
    let contentWithoutUrls = messageContent;
    
    attachments.forEach(attachment => {
      contentWithoutUrls = contentWithoutUrls.replace(attachment.url, '');
    });

    const explanationEmbed = new EmbedBuilder()
      .setTitle(`📚 شرح: ${roomName}`)
      .setDescription(contentWithoutUrls.trim() || 'لا يوجد نص إضافي')
      .setColor(Colors.Green)
      .setFooter({ 
        text: `الشرح تم تقديمه بواسطة ${originalRequester.tag}`,
        iconURL: originalRequester.displayAvatarURL() 
      })
      .setTimestamp();

    const messageParts = [];
    
    attachments.forEach((attachment) => {
      let attachmentType = '';
      switch(attachment.type) {
        case 'image': attachmentType = '🖼️ صورة'; break;
        case 'video': attachmentType = '🎬 فيديو'; break;
        case 'audio': attachmentType = '🎵 صوت'; break;
        case 'document': attachmentType = '📄 ملف'; break;
        default: attachmentType = '🔗 رابط';
      }
      messageParts.push(`${attachmentType}: ${attachment.url}`);
    });

    await textChannel.send({ 
      content: `بواسطة: ${originalRequester}\n${messageParts.join('\n')}`,
      embeds: [explanationEmbed] 
    });

    for (const attachment of attachments) {
      if (attachment.type === 'image' || attachment.type === 'video') {
        try {
          const attachmentEmbed = new EmbedBuilder()
            .setTitle(attachment.type === 'image' ? '🖼️ صورة مرفقة' : '🎬 فيديو مرفق')
            .setColor(Colors.Blue)
            .setImage(attachment.type === 'image' ? attachment.url : null)
            .setURL(attachment.url)
            .setTimestamp();

          await textChannel.send({ 
            content: attachment.type === 'video' ? `**فيديو مرفق:**\n${attachment.url}` : null,
            embeds: attachment.type === 'image' ? [attachmentEmbed] : []
          });
        } catch (error) {
          console.error(`❌ خطأ في إرسال المرفق:`, error);
          await textChannel.send(`🔗 ${attachment.url}`);
        }
      }
    }

    if (explanationRoleId) {
      try {
        const member = await guild.members.fetch(originalRequester.id);
        const role = guild.roles.cache.get(explanationRoleId);
        if (role && !member.roles.cache.has(explanationRoleId)) {
          await member.roles.add(role, `تقديم شرح: ${roomName}`);
          
          await sendExplanationLog(
            "🎖️ منح رول المساهم",
            `تم منح رول المساهم لـ **${originalRequester.tag}** لتقديمه شرح **${roomName}**`,
            Colors.Gold,
            [
              { name: '👤 المستخدم', value: `${originalRequester.tag} (<@${originalRequester.id}>)`, inline: true },
              { name: '📝 الشرح', value: roomName, inline: true },
              { name: '🎖️ الرول', value: `<@&${explanationRoleId}>`, inline: true }
            ]
          );
        }
      } catch (roleError) {
        console.error('❌ خطأ في منح الرول:', roleError);
      }
    }

    return textChannel;
  } catch (error) {
    console.error('❌ خطأ في إنشاء روم الشرح:', error);
    throw error;
  }
}

async function handleExplanationCommand(message) {
  await sendExplanationLog(
    "📚 تشغيل نظام الشرح",
    `تم تشغيل أمر الشرح بواسطة ${message.author.tag}`,
    Colors.Blue,
    [
      { name: '👤 المستخدم', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
      { name: '📌 القناة', value: `<#${message.channel.id}>`, inline: true }
    ]
  );

  const embed = new EmbedBuilder()
    .setTitle('📚 نظام طلبات الشرح')
    .setDescription('مرحباً! يمكنك تقديم طلب شرح عبر هذا النظام. اضغط على الزر لبدء طلب جديد:')
    .setColor(Colors.Blue)
    .addFields(
      {
        name: '📝 كيفية العمل',
        value: 'سيطلب منك إدخال:\n• آيدي الكاتجوري\n• اسم الروم الجديد\n• محتوى الشرح (يمكن إضافة روابط، صور، ملفات)'
      },
      {
        name: '⚡ العملية',
        value: 'سيتم مراجعة طلبك وإنشاء الروم تلقائياً بعد القبول'
      },
      {
        name: '🎁 مكافأة',
        value: process.env.EXPLANATION_ROLE_ID ? 
          `سيتم منحك رول <@&${process.env.EXPLANATION_ROLE_ID}> بعد نشر الشرح! 🎖️` : 
          'تقدير للمساهمين في الشرح 🌟'
      }
    )
    .setFooter({ text: 'سيتم إنشاء روم شرح جديد بعد الموافقة على طلبك' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('start_explanation_request')
      .setLabel('📝 بدء طلب شرح')
      .setStyle(ButtonStyle.Primary)
  );

  await message.reply({ embeds: [embed], components: [row] });
}

async function handleExplanationInteraction(interaction) {
  // بدء طلب الشرح
  if (interaction.isButton() && interaction.customId === 'start_explanation_request') {
    await sendExplanationLog(
      "📝 بدء طلب شرح جديد",
      `بدأ ${interaction.user.tag} عملية تقديم طلب شرح`,
      Colors.Blue,
      [{ name: '👤 المستخدم', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true }]
    );

    const modal = new ModalBuilder()
      .setCustomId('modal_explanation_request')
      .setTitle('📝 تقديم طلب شرح جديد');

    const categoryInput = new TextInputBuilder()
      .setCustomId('category_id')
      .setLabel('آيدي الكاتجوري')
      .setPlaceholder('123456789012345678')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const roomNameInput = new TextInputBuilder()
      .setCustomId('room_name')
      .setLabel('اسم الروم الجديد')
      .setPlaceholder('شرح-البرمجة-المتقدمة')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const contentInput = new TextInputBuilder()
      .setCustomId('explanation_content')
      .setLabel('محتوى الشرح')
      .setPlaceholder('اكتب هنا الشرح الكامل... يمكنك إضافة روابط، صور، ملفات، إلخ.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(categoryInput),
      new ActionRowBuilder().addComponents(roomNameInput),
      new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // تقديم النموذج
  if (interaction.isModalSubmit() && interaction.customId === 'modal_explanation_request') {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const categoryId = interaction.fields.getTextInputValue('category_id');
      const roomName = interaction.fields.getTextInputValue('room_name');
      const explanationContent = interaction.fields.getTextInputValue('explanation_content');

      const category = interaction.guild.channels.cache.get(categoryId);
      if (!category || category.type !== ChannelType.GuildCategory) {
        await sendExplanationLog(
          "❌ طلب شرح مرفوض - كاتجوري غير صحيح",
          `قدم ${interaction.user.tag} طلب شرح بكاتجوري غير صحيح`,
          Colors.Red,
          [
            { name: '👤 المستخدم', value: `${interaction.user.tag}`, inline: true },
            { name: '📝 آيدي الكاتجوري', value: categoryId, inline: true }
          ]
        );
        return await interaction.editReply('❌ آيدي الكاتجوري غير صحيح أو الكاتجوري غير موجود!');
      }

      const requestId = Date.now().toString();
      explanationRequests.set(requestId, {
        categoryId: categoryId,
        roomName: roomName,
        content: explanationContent,
        requester: interaction.user,
        timestamp: Date.now(),
        originalCategoryId: categoryId,
        originalRoomName: roomName,
        originalContent: explanationContent
      });

      const reviewChannelId = process.env.EXPLANATION_REVIEW_CHANNEL_ID;
      if (!reviewChannelId) {
        return await interaction.editReply('❌ لم يتم تحديد قناة المراجعة في الإعدادات. يرجى التواصل مع المسؤول.');
      }

      const reviewChannel = interaction.guild.channels.cache.get(reviewChannelId);
      if (!reviewChannel) {
        return await interaction.editReply('❌ قناة المراجعة غير موجودة. يرجى التواصل مع المسؤول.');
      }

      const attachments = extractAttachments(explanationContent);
      let displayContent = explanationContent;
      let attachmentsInfo = 'لا توجد مرفقات';
      
      if (attachments.length > 0) {
        attachmentsInfo = attachments.map(att => {
          const types = {
            'image': '🖼️ صورة',
            'video': '🎬 فيديو', 
            'audio': '🎵 صوت',
            'document': '📄 ملف',
            'link': '🔗 رابط'
          };
          return `${types[att.type]}: ${att.url}`;
        }).join('\n');
        
        displayContent = explanationContent.length > 800 ? 
          explanationContent.substring(0, 800) + '...' : 
          explanationContent;
      }

      const reviewEmbed = new EmbedBuilder()
        .setTitle('📚 طلب شرح جديد')
        .setColor(Colors.Yellow)
        .addFields(
          {
            name: '👤 مقدم الطلب',
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true
          },
          {
            name: '📂 الكاتجوري',
            value: `📁 ${category.name} (\`${categoryId}\`)`,
            inline: true
          },
          {
            name: '📝 اسم الروم المقترح',
            value: roomName,
            inline: true
          },
          {
            name: '📎 المرفقات',
            value: attachmentsInfo,
            inline: false
          }
        )
        .addFields({
          name: '📄 محتوى الشرح',
          value: displayContent,
          inline: false
        })
        .setTimestamp();

      const reviewButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`explanation_approve_${requestId}`)
          .setLabel('✅ قبول')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`explanation_approve_edit_${requestId}`)
          .setLabel('✏️ قبول مع تعديل')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`explanation_reject_${requestId}`)
          .setLabel('❌ رفض')
          .setStyle(ButtonStyle.Danger)
      );

      await reviewChannel.send({ 
        embeds: [reviewEmbed], 
        components: [reviewButtons] 
      });

      await sendExplanationLog(
        "📨 طلب شرح مرسل للمراجعة",
        `تم إرسال طلب شرح من ${interaction.user.tag} للمراجعة`,
        Colors.Yellow,
        [
          { name: '👤 المستخدم', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 اسم الروم', value: roomName, inline: true },
          { name: '📂 الكاتجوري', value: category.name, inline: true }
        ]
      );

      await interaction.editReply('✅ تم إرسال طلب الشرح بنجاح! سيتم مراجعته من قبل الفريق المختص وسيتم إعلامك بالقرار.');

    } catch (error) {
      console.error('❌ خطأ في معالجة طلب الشرح:', error);
      await interaction.editReply('❌ حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.');
    }
    return;
  }

  // قبول الطلب
  if (interaction.isButton() && interaction.customId.startsWith('explanation_approve_')) {
    if (!interaction.customId.includes('_edit_')) {
      await handleApproveExplanation(interaction, false);
      return;
    }
    
    const requestId = interaction.customId.replace('explanation_approve_edit_', '');
    const request = explanationRequests.get(requestId);
    
    if (!request) {
      return await interaction.reply({ content: '❌ طلب الشرح غير موجود أو انتهت صلاحيته.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_edit_approve_${requestId}`)
      .setTitle('✏️ قبول مع تعديل الطلب');

    const categoryInput = new TextInputBuilder()
      .setCustomId('edit_category_id')
      .setLabel('آيدي الكاتجوري (عدل إذا لزم)')
      .setValue(request.categoryId)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const roomNameInput = new TextInputBuilder()
      .setCustomId('edit_room_name')
      .setLabel('اسم الروم الجديد (عدل إذا لزم)')
      .setValue(request.roomName)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const contentInput = new TextInputBuilder()
      .setCustomId('edit_content')
      .setLabel('محتوى الشرح (عدل إذا لزم)')
      .setValue(request.content)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(categoryInput),
      new ActionRowBuilder().addComponents(roomNameInput),
      new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // نموذج القبول مع التعديل
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_edit_approve_')) {
    await interaction.deferReply({ ephemeral: true });
    
    const requestId = interaction.customId.replace('modal_edit_approve_', '');
    const request = explanationRequests.get(requestId);
    
    if (!request) {
      return await interaction.editReply('❌ طلب الشرح غير موجود أو انتهت صلاحيته.');
    }

    try {
      request.categoryId = interaction.fields.getTextInputValue('edit_category_id');
      request.roomName = interaction.fields.getTextInputValue('edit_room_name');
      request.content = interaction.fields.getTextInputValue('edit_content');

      await handleApproveExplanation(interaction, true, requestId);
      
    } catch (error) {
      console.error('❌ خطأ في معالجة القبول مع التعديل:', error);
      await interaction.editReply('❌ حدث خطأ أثناء معالجة القبول مع التعديل.');
    }
    return;
  }

  // رفض الطلب
  if (interaction.isButton() && interaction.customId.startsWith('explanation_reject_')) {
    const requestId = interaction.customId.replace('explanation_reject_', '');
    const request = explanationRequests.get(requestId);
    
    if (!request) {
      return await interaction.reply({ content: '❌ طلب الشرح غير موجود أو انتهت صلاحيته.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_reject_reason_${requestId}`)
      .setTitle('❌ إدخال سبب الرفض');

    const reasonInput = new TextInputBuilder()
      .setCustomId('rejection_reason')
      .setLabel('سبب الرفض')
      .setPlaceholder('يرجى كتابة سبب الرفض بشكل واضح...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    
    await interaction.showModal(modal);
    return;
  }

  // نموذج سبب الرفض
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reject_reason_')) {
    await interaction.deferReply({ ephemeral: true });
    
    const requestId = interaction.customId.replace('modal_reject_reason_', '');
    const request = explanationRequests.get(requestId);
    
    if (!request) {
      return await interaction.editReply('❌ طلب الشرح غير موجود أو انتهت صلاحيته.');
    }

    try {
      const rejectionReason = interaction.fields.getTextInputValue('rejection_reason');

      const rejectEmbed = new EmbedBuilder()
        .setTitle('❌ تم رفض طلب الشرح')
        .setColor(Colors.Red)
        .setDescription('نأسف، تم رفض طلب الشرح الذي قدمته.')
        .addFields({
          name: '📋 سبب الرفض',
          value: rejectionReason,
          inline: false
        })
        .setFooter({ text: 'يمكنك تعديل الطلب وإرساله مرة أخرى' })
        .setTimestamp();

      try {
        await request.requester.send({ embeds: [rejectEmbed] });
      } catch (dmError) {
        console.error('❌ فشل إرسال رسالة الرفض للخاص:', dmError);
      }

      const originalEmbed = interaction.message.embeds[0];
      const rejectedEmbed = new EmbedBuilder(originalEmbed)
        .setColor(Colors.Red)
        .setTitle('❌ تم رفض طلب الشرح')
        .addFields(
          {
            name: '👨‍💼 تم الرفض بواسطة',
            value: interaction.user.tag,
            inline: true
          },
          {
            name: '📋 سبب الرفض',
            value: rejectionReason.length > 500 ? 
              rejectionReason.substring(0, 500) + '...' : 
              rejectionReason,
            inline: false
          },
          {
            name: '⏰ وقت الرفض',
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true
          }
        );

      await interaction.message.edit({ 
        embeds: [rejectedEmbed], 
        components: [] 
      });

      await sendExplanationLog(
        "❌ طلب شرح مرفوض",
        `تم رفض طلب شرح من ${request.requester.tag} بواسطة ${interaction.user.tag}`,
        Colors.Red,
        [
          { name: '👤 مقدم الطلب', value: `${request.requester.tag}`, inline: true },
          { name: '👤 المعالج', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 سبب الرفض', value: rejectionReason.length > 200 ? rejectionReason.substring(0, 200) + '...' : rejectionReason, inline: false }
        ]
      );

      await interaction.editReply('✅ تم رفض طلب الشرح وإعلام المستخدم بالسبب.');
      explanationRequests.delete(requestId);

    } catch (error) {
      console.error('❌ خطأ في معالجة رفض الطلب:', error);
      await interaction.editReply('❌ حدث خطأ أثناء معالجة الرفض. يرجى المحاولة مرة أخرى.');
    }
    return;
  }
}

async function handleApproveExplanation(interaction, isEdited = false, requestId = null) {
  try {
    if (!requestId) {
      requestId = interaction.customId.replace('explanation_approve_', '');
    }
    
    const request = explanationRequests.get(requestId);
    
    if (!request) {
      return await interaction.reply({ content: '❌ طلب الشرح غير موجود أو انتهت صلاحيته.', ephemeral: true });
    }

    const category = interaction.guild.channels.cache.get(request.categoryId);
    if (!category) {
      return await interaction.reply({ content: '❌ الكاتجوري لم يعد موجوداً!', ephemeral: true });
    }

    const createdChannel = await createExplanationRoom(
      interaction, 
      request.categoryId, 
      request.roomName, 
      request.content, 
      request.requester
    );

    const acceptEmbed = new EmbedBuilder()
      .setTitle('✅ تم قبول طلب الشرح' + (isEdited ? ' (مع تعديل)' : ''))
      .setColor(Colors.Green)
      .setDescription('تم قبول طلب الشرح الذي قدمته!' + (isEdited ? ' مع بعض التعديلات.' : ''))
      .addFields(
        {
          name: '📁 الكاتجوري',
          value: `📁 ${category.name}`,
          inline: true
        },
        {
          name: '📝 روم الشرح',
          value: `${createdChannel}`,
          inline: true
        }
      )
      .addFields({
        name: '🎁 مكافأة',
        value: process.env.EXPLANATION_ROLE_ID ? 
          `تم منحك رول <@&${process.env.EXPLANATION_ROLE_ID}> 🎖️\nشكراً لمساهمتك في نشر المعرفة!` : 
          'شكراً لمساهمتك في نشر المعرفة! 🌟',
        inline: false
      })
      .setTimestamp();

    try {
      await request.requester.send({ embeds: [acceptEmbed] });
    } catch (dmError) {
      console.error('❌ فشل إرسال رسالة القبول للخاص:', dmError);
    }

    const originalEmbed = interaction.message.embeds[0];
    const approvedEmbed = new EmbedBuilder(originalEmbed)
      .setColor(Colors.Green)
      .setTitle('✅ تم قبول طلب الشرح' + (isEdited ? ' (مع تعديل)' : ''))
      .addFields(
        {
          name: '👨‍💼 تم القبول بواسطة',
          value: interaction.user.tag,
          inline: true
        },
        {
          name: '⏰ وقت القبول',
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        },
        {
          name: '📝 الروم المنشأ',
          value: `${createdChannel}`,
          inline: true
        }
      );

    if (isEdited) {
      approvedEmbed.addFields({
        name: '✏️ التعديلات',
        value: `تم تعديل الطلب قبل القبول:\n- الكاتجوري: ${request.originalCategoryId} → ${request.categoryId}\n- اسم الروم: ${request.originalRoomName} → ${request.roomName}`,
        inline: false
      });
    }

    await interaction.message.edit({ 
      embeds: [approvedEmbed], 
      components: [] 
    });

    const notificationChannelId = process.env.EXPLANATION_NOTIFICATION_CHANNEL_ID;
    if (notificationChannelId) {
      const notificationChannel = interaction.guild.channels.cache.get(notificationChannelId);
      if (notificationChannel) {
        const notificationEmbed = new EmbedBuilder()
          .setTitle('📚 تم نشر شرح جديد' + (isEdited ? ' (مع تعديل)' : ''))
          .setColor(Colors.Green)
          .setDescription(`تم قبول ونشر شرح جديد بواسطة ${request.requester.tag}`)
          .addFields(
            {
              name: '📝 الروم',
              value: `${createdChannel}`,
              inline: true
            },
            {
              name: '👨‍💼 تمت المراجعة بواسطة',
              value: interaction.user.tag,
              inline: true
            }
          )
          .setTimestamp();

        await notificationChannel.send({ embeds: [notificationEmbed] });
      }
    }

    await sendExplanationLog(
      "✅ طلب شرح مقبول" + (isEdited ? ' (مع تعديل)' : ''),
      `تم قبول طلب شرح من ${request.requester.tag} بواسطة ${interaction.user.tag}`,
      Colors.Green,
      [
        { name: '👤 مقدم الطلب', value: `${request.requester.tag}`, inline: true },
        { name: '👤 المعالج', value: `${interaction.user.tag}`, inline: true },
        { name: '📝 الروم المنشأ', value: `${createdChannel}`, inline: true },
        { name: '✏️ التعديلات', value: isEdited ? 'نعم' : 'لا', inline: true }
      ]
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply('✅ تم قبول طلب الشرح بنجاح وإنشاء الروم وإعلام المستخدم.');
    } else {
      await interaction.reply({ content: '✅ تم قبول طلب الشرح بنجاح وإنشاء الروم وإعلام المستخدم.', ephemeral: true });
    }

    explanationRequests.delete(requestId);

  } catch (error) {
    console.error('❌ خطأ في معالجة قبول الطلب:', error);
    await sendExplanationLog(
      "❌ خطأ في قبول طلب الشرح",
      `حدث خطأ أثناء قبول طلب شرح`,
      Colors.Red,
      [
        { name: '👤 المعالج', value: `${interaction.user.tag}`, inline: true },
        { name: '📝 الخطأ', value: error.message, inline: true }
      ]
    );
    
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply('❌ حدث خطأ أثناء معالجة القبول. يرجى المحاولة مرة أخرى.');
    } else {
      await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة القبول. يرجى المحاولة مرة أخرى.', ephemeral: true });
    }
  }
}

// تنظيف الطلبات القديمة تلقائياً كل ساعة
setInterval(() => {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  for (const [requestId, request] of explanationRequests.entries()) {
    if (now - request.timestamp > twentyFourHours) {
      explanationRequests.delete(requestId);
      console.log(`🧹 تم تنظيف طلب شرح منتهي الصلاحية: ${requestId}`);
    }
  }
}, 60 * 60 * 1000);

console.log('✅ نظام طلبات الشرح (Explanation Requests) تم تحميله بنجاح!');

clientTag.login(process.env.TOKEN_ZAGLGROUPBOT);
